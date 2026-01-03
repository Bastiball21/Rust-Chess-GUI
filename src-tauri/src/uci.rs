use std::process::Stdio;
use tokio::process::Command;
use tokio::io::{BufReader, AsyncBufReadExt, AsyncWriteExt, BufWriter};
use tokio::sync::mpsc;
use anyhow::{Result, Context};

#[derive(Clone, Debug)]
pub struct EngineInfo {
    pub name: String,
    pub author: String,
    pub options: Vec<String>, // Placeholder for UCI options
}

use tokio::sync::broadcast;

#[derive(Clone)]
pub struct AsyncEngine {
    stdin_tx: mpsc::Sender<String>,
    // We use broadcast so multiple listeners (Arbiter + Logger) can hear the engine
    pub stdout_broadcast: broadcast::Sender<String>,
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

        let mut child = cmd.spawn().context("Failed to spawn engine")?;
        let stdin = child.stdin.take().expect("Failed to open stdin");
        let stdout = child.stdout.take().expect("Failed to open stdout");

        let (stdin_tx, mut stdin_rx) = mpsc::channel::<String>(100);
        let (stdout_tx, _) = broadcast::channel::<String>(100);

        // Writer task
        tokio::spawn(async move {
            let mut writer = BufWriter::new(stdin);
            while let Some(cmd) = stdin_rx.recv().await {
                if let Err(_) = writer.write_all(cmd.as_bytes()).await { break; }
                if !cmd.ends_with('\n') {
                    if let Err(_) = writer.write_all(b"\n").await { break; }
                }
                if let Err(_) = writer.flush().await { break; }
            }
        });

        // Reader task
        let stdout_tx_clone = stdout_tx.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if stdout_tx_clone.send(line).is_err() {
                    // Receiver dropped
                }
            }
        });

        Ok(Self { stdin_tx, stdout_broadcast: stdout_tx })
    }

    pub async fn send(&self, cmd: String) -> Result<()> {
        self.stdin_tx.send(cmd).await.map_err(|_| anyhow::anyhow!("Failed to send command"))
    }

    pub async fn quit(&self) -> Result<()> {
        self.send("quit".to_string()).await
    }
}
