use std::process::Stdio;
use tokio::process::Command;
use tokio::io::{BufReader, AsyncBufReadExt, AsyncWriteExt, BufWriter};
use tokio::sync::mpsc;
use tokio::sync::broadcast;
use anyhow::{Result, Context};
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::types::UciOption;

#[derive(Clone, Debug)]
pub struct EngineInfo {
    pub name: String,
    pub author: String,
    pub options: Vec<String>,
}

#[derive(Clone)]
pub struct AsyncEngine {
    stdin_tx: mpsc::Sender<String>,
    kill_tx: mpsc::Sender<()>,
    pub stdout_broadcast: broadcast::Sender<String>,
    // We keep an Arc Mutex to track if it's alive, mostly for debugging
    pub is_alive: Arc<Mutex<bool>>,
}

impl AsyncEngine {
    pub async fn spawn(path: &str) -> Result<Self> {
        let mut cmd = Command::new(path);
        cmd.stdin(Stdio::piped())
           .stdout(Stdio::piped())
           .stderr(Stdio::null());

        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        cmd.kill_on_drop(true);

        let mut child = cmd.spawn().context(format!("Failed to spawn engine at {}", path))?;

        let stdin = child.stdin.take().context("Failed to open stdin")?;
        let stdout = child.stdout.take().context("Failed to open stdout")?;

        let (stdin_tx, mut stdin_rx) = mpsc::channel::<String>(100);
        let (kill_tx, mut kill_rx) = mpsc::channel::<()>(1);
        let (stdout_tx, _) = broadcast::channel::<String>(100);

        let is_alive = Arc::new(Mutex::new(true));
        let is_alive_clone = is_alive.clone();

        // Clone for the loop task so we don't move the original
        let stdout_tx_loop = stdout_tx.clone();

        // Supervisor task
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout);
            let mut writer = BufWriter::new(stdin);
            let mut line_buf = String::new();

            loop {
                tokio::select! {
                    _ = kill_rx.recv() => {
                        let _ = child.kill().await;
                        break;
                    }
                    cmd_opt = stdin_rx.recv() => {
                        if let Some(cmd) = cmd_opt {
                             // Write to engine
                             if writer.write_all(cmd.as_bytes()).await.is_err() { break; }
                             if !cmd.ends_with('\n') {
                                 if writer.write_all(b"\n").await.is_err() { break; }
                             }
                             if writer.flush().await.is_err() { break; }
                        } else {
                            // Channel closed
                            break;
                        }
                    }
                    res = reader.read_line(&mut line_buf) => {
                        match res {
                            Ok(0) => break, // EOF
                            Ok(_) => {
                                let trim_line = line_buf.trim().to_string();
                                if !trim_line.is_empty() {
                                    let _ = stdout_tx_loop.send(trim_line);
                                }
                                line_buf.clear();
                            }
                            Err(_) => break,
                        }
                    }
                    _status = child.wait() => {
                        // Process exited
                        break;
                    }
                }
            }
            // Ensure kill on exit
            let _ = child.kill().await;
            *is_alive_clone.lock().await = false;
        });

        Ok(Self {
            stdin_tx,
            kill_tx,
            stdout_broadcast: stdout_tx,
            is_alive
        })
    }

    pub async fn send(&self, cmd: String) -> Result<()> {
        if self.stdin_tx.send(cmd).await.is_err() {
            return Err(anyhow::anyhow!("Engine process is dead"));
        }
        Ok(())
    }

    pub async fn set_option(&self, name: &str, value: &str) -> Result<()> {
        self.send(format!("setoption name {} value {}", name, value)).await
    }

    pub async fn quit(&self) -> Result<()> {
        let _ = self.send("quit".to_string()).await;
        // Give it a moment to quit gracefully, then force kill
        let kill_tx = self.kill_tx.clone();
        tokio::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            let _ = kill_tx.send(()).await;
        });
        Ok(())
    }

    pub async fn kill(&self) -> Result<()> {
        let _ = self.kill_tx.send(()).await;
        Ok(())
    }
}

pub async fn query_engine_options(path: &str) -> Result<Vec<UciOption>> {
    let engine = AsyncEngine::spawn(path).await?;
    let mut rx = engine.stdout_broadcast.subscribe();

    engine.send("uci".to_string()).await?;

    let options = tokio::time::timeout(tokio::time::Duration::from_secs(5), async {
        let mut options = Vec::new();
        loop {
            match rx.recv().await {
                Ok(line) => {
                    if line == "uciok" {
                        return Ok(options);
                    }
                    if line.starts_with("option name ") {
                        if let Some(opt) = parse_uci_option(&line) {
                            options.push(opt);
                        }
                    }
                }
                Err(_) => {
                    return Err(anyhow::anyhow!("Engine disconnected before uciok"));
                }
            }
        }
    }).await;

    let _ = engine.quit().await;

    match options {
        Ok(Ok(options)) => Ok(options),
        Ok(Err(err)) => Err(err),
        Err(_) => {
            let _ = engine.kill().await;
            Err(anyhow::anyhow!("Timeout waiting for uciok"))
        }
    }
}

fn parse_uci_option(line: &str) -> Option<UciOption> {
    // Format: option name <Name> type <Type> [default <Default>] [min <Min> max <Max>] [var <Var> var <Var>]
    let parts: Vec<&str> = line.split_whitespace().collect();
    // Simplified parsing logic
    // Finding indices of keywords
    let name_idx = parts.iter().position(|&x| x == "name")?;
    let type_idx = parts.iter().position(|&x| x == "type")?;

    if type_idx <= name_idx { return None; }

    let name = parts[name_idx+1..type_idx].join(" ");
    let type_str = parts[type_idx+1];

    let mut default_val = None;
    let mut min_val = None;
    let mut max_val = None;
    let mut vars = Vec::new();

    let mut i = type_idx + 2;
    while i < parts.len() {
        match parts[i] {
            "default" => {
                // Default might consume until next keyword or end
                // But UCI is tricky. Usually default is single token unless string type
                // Heuristic: consume until 'min', 'max', 'var' or end
                let start = i + 1;
                let mut end = start;
                while end < parts.len() && !["min", "max", "var"].contains(&parts[end]) {
                    end += 1;
                }
                if end > start {
                    default_val = Some(parts[start..end].join(" "));
                }
                i = end;
            },
            "min" => {
                if i + 1 < parts.len() {
                    min_val = parts[i+1].parse::<i32>().ok();
                }
                i += 2;
            },
            "max" => {
                if i + 1 < parts.len() {
                    max_val = parts[i+1].parse::<i32>().ok();
                }
                i += 2;
            },
            "var" => {
                // 'var' can appear multiple times for combos
                // Value is usually remaining part? No, combos are: var x var y ...
                // Actually combos are: option name Style type combo default Normal var Normal var Solid var Aggressive
                // So 'var' is followed by a value string until next 'var' or end
                 let start = i + 1;
                 let mut end = start;
                 while end < parts.len() && parts[end] != "var" {
                     end += 1;
                 }
                 if end > start {
                     vars.push(parts[start..end].join(" "));
                 }
                 i = end;
            },
            _ => {
                i += 1;
            }
        }
    }

    Some(UciOption {
        name,
        option_type: type_str.to_string(),
        default: default_val,
        min: min_val,
        max: max_val,
        var: vars,
    })
}
