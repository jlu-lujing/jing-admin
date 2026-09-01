use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::response::Response;
use futures::stream::SplitSink;
use futures::{SinkExt, StreamExt};
use std::sync::atomic::{AtomicUsize, Ordering};
use tokio::sync::broadcast;

use crate::auth::verify_token;
use crate::notify;
use crate::state::AppState;

static ONLINE: AtomicUsize = AtomicUsize::new(0);

pub fn online_count() -> usize {
    ONLINE.load(Ordering::Relaxed)
}

#[derive(serde::Deserialize)]
pub struct WsQuery {
    token: String,
}

pub async fn handler(
    State(_state): State<AppState>,
    Query(q): Query<WsQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    let claims = match verify_token(&q.token, "access") {
        Ok(c) => c,
        Err(_) => {
            return Response::builder()
                .status(axum::http::StatusCode::UNAUTHORIZED)
                .body(axum::body::Body::empty())
                .unwrap()
        }
    };
    ws.on_upgrade(move |socket| run(socket, claims.sub))
}

async fn run(socket: WebSocket, user_id: i64) {
    let (mut sink, mut stream) = socket.split();
    let mut rx = notify::subscribe();
    ONLINE.fetch_add(1, Ordering::Relaxed);

    let hello = serde_json::json!({ "type": "hello", "online": online_count() });
    let _ = sink.send(Message::Text(hello.to_string().into())).await;

    let mut ticker = tokio::time::interval(std::time::Duration::from_secs(30));
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        tokio::select! {
            received = stream.next() => {
                match received {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(p))) => { if sink.send(Message::Pong(p)).await.is_err() { break; } }
                    Some(Err(_)) => break,
                    _ => {}
                }
            }
            msg = rx.recv() => {
                match msg {
                    Ok(text) => {
                        let deliver = serde_json::from_str::<serde_json::Value>(&text)
                            .map(|v| match v.get("userId") {
                                Some(serde_json::Value::Null) | None => true,
                                Some(serde_json::Value::Number(n)) => n.as_i64() == Some(user_id),
                                _ => false,
                            })
                            .unwrap_or(true);
                        if deliver && sink.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
            _ = ticker.tick() => {
                if sink.send(Message::Ping(axum::body::Bytes::new())).await.is_err() { break; }
            }
        }
    }
    ONLINE.fetch_sub(1, Ordering::Relaxed);
    let _ = sink.close().await;
}

fn _silence(s: SplitSink<WebSocket, Message>) {
    let _ = s;
}
