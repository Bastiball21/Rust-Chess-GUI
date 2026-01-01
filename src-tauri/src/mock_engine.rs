use std::io::{self, BufRead, Write};
use std::thread;
use std::time::Duration;

fn main() {
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    let mut depth = 1;
    let mut bestmove = "e2e4";

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
                "ucinewgame" => {},
                "position" => {
                    // Primitive parsing to "guess" a move or just play random/fixed
                    // In a real mock, we might track position.
                    // For now, if white to move, play e2e4, if black, play e7e5 (if possible)
                    // But to be valid, we should use a minimal chess lib or just always return a legal move for the start pos.
                    // Since this is just to test the GUI, we can return pre-canned moves or random valid moves if we had a board.
                    // For now, let's just sleep and return a move.
                },
                "go" => {
                    // simulate thinking
                    for i in 1..=5 {
                        println!("info depth {} nodes {} score cp 10 pv e2e4", i, i * 100);
                        thread::sleep(Duration::from_millis(200));
                    }
                    println!("bestmove e2e4");
                },
                "quit" => break,
                _ => {}
            }
            stdout.flush().unwrap();
        }
    }
}
