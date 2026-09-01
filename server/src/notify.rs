use std::sync::OnceLock;
use tokio::sync::broadcast;

static TX: OnceLock<broadcast::Sender<String>> = OnceLock::new();

fn tx() -> &'static broadcast::Sender<String> {
    TX.get_or_init(|| broadcast::channel(128).0)
}

pub fn push(payload: serde_json::Value) {
    let _ = tx().send(payload.to_string());
}

pub fn subscribe() -> broadcast::Receiver<String> {
    tx().subscribe()
}
