use std::io::{self, BufRead, Write};
use std::thread;
use std::time::Duration;

fn main() {
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line in stdin.lock().lines() {
        if let Ok(cmd) = line {
            let parts: Vec<&str> = cmd.split_whitespace().collect();
            if parts.is_empty() { continue; }

            match parts[0] {
                "uci" => {
                    println!("id name MockEngine 1.0");
                    println!("id author Jules");
                    println!("uciok");
                },
                "isready" => println!("readyok"),
                "ucinewgame" => {
                    // Reset game state if we were tracking it
                },
                "position" => {
                    // We don't track position in this simple mock
                },
                "go" => {
                    // simulate thinking
                    // Send some info
                    println!("info depth 1 score cp 20 nodes 100 pv e2e4");
                    thread::sleep(Duration::from_millis(500));
                    println!("info depth 2 score cp 25 nodes 200 pv e2e4");
                    thread::sleep(Duration::from_millis(500));

                    // Always return a valid move if possible, or just e2e4/e7e5 if startpos.
                    // But if the arbiter sends a position where e2e4 is illegal, this mock will crash the arbiter or cause illegal move.
                    // The arbiter logic checks legality.
                    // For "startpos", e2e4 is valid for white.
                    // For "startpos moves e2e4", black to move. e7e5 is valid.
                    // To be smarter without a chess library, we can check the 'position' command string.

                    // Check if 'position' command was sent previously? No, we need to store state.
                    // But here we process line by line.
                    // Actually, 'go' comes after 'position'.
                    // Let's just alternate or random for now, or just e2e4 if we assume we are white.
                    // A true mock needs to be smarter or we only test white.
                    // Let's try to be slightly smarter by checking if "moves" contains "e2e4".
                    // But we don't have access to the previous position command here easily unless we store it.

                    // For the purpose of "Verification Strategy", the user asked for "replies id name MockEngine and bestmove e2e4".
                    // I will stick to that strictly as requested.
                    println!("bestmove e2e4");
                },
                "quit" => break,
                _ => {}
            }
            stdout.flush().unwrap();
        }
    }
}
