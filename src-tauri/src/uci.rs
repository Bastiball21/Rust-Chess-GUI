use std::process::Stdio;
use tokio::process::Command;
use tokio::io::{BufReader, AsyncBufReadExt, AsyncWriteExt, BufWriter};
use tokio::sync::mpsc;
use tokio::sync::broadcast;
use anyhow::{Result, Context};
use std::sync::Arc;
use tokio::sync::Mutex;

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
            use std::os::windows::process::CommandExt;
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
