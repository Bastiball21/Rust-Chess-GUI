use mini_tcec_lib::uci::query_engine_options;
#[tokio::main]
async fn main() {
    let path = "./src-tauri/target/debug/mock-engine"; // Assuming mock engine is built
    // Actually we need to make sure mock engine is built.
    println!("Querying...");
    match query_engine_options(path).await {
        Ok(opts) => println!("Options: {:?}", opts),
        Err(e) => println!("Error: {}", e),
    }
}
