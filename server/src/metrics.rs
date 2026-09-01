use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::sync::Mutex;

static REQ_2XX: AtomicU64 = AtomicU64::new(0);
static REQ_4XX: AtomicU64 = AtomicU64::new(0);
static REQ_5XX: AtomicU64 = AtomicU64::new(0);
static LOGIN_OK: AtomicU64 = AtomicU64::new(0);
static LOGIN_FAIL: AtomicU64 = AtomicU64::new(0);
static START: OnceLock<std::time::Instant> = OnceLock::new();
static TOP_PATHS: OnceLock<Mutex<std::collections::HashMap<String, u64>>> = OnceLock::new();
/// 延迟直方图桶: le = 5,10,25,50,100,250,500,1000,2000ms + Inf
pub static LAT_BUCKETS: [u64; 9] = [5, 10, 25, 50, 100, 250, 500, 1000, 2000];
static LAT: [std::sync::atomic::AtomicU64; 10] = [
    std::sync::atomic::AtomicU64::new(0), std::sync::atomic::AtomicU64::new(0),
    std::sync::atomic::AtomicU64::new(0), std::sync::atomic::AtomicU64::new(0),
    std::sync::atomic::AtomicU64::new(0), std::sync::atomic::AtomicU64::new(0),
    std::sync::atomic::AtomicU64::new(0), std::sync::atomic::AtomicU64::new(0),
    std::sync::atomic::AtomicU64::new(0), std::sync::atomic::AtomicU64::new(0),
];

pub fn observe_latency(ms: u64) {
    let idx = LAT_BUCKETS.iter().position(|b| ms <= *b).unwrap_or(9);
    LAT[idx].fetch_add(1, Ordering::Relaxed);
}

pub fn observe(status: u16, path: &str) {
    let _ = START.get_or_init(std::time::Instant::now);
    match status {
        200..=299 => REQ_2XX.fetch_add(1, Ordering::Relaxed),
        400..=499 => REQ_4XX.fetch_add(1, Ordering::Relaxed),
        500..=599 => REQ_5XX.fetch_add(1, Ordering::Relaxed),
        _ => 0,
    };
    if status >= 400 {
        let map = TOP_PATHS.get_or_init(Default::default);
        let mut g = map.lock().unwrap();
        *g.entry(path.to_string()).or_default() += 1;
    }
}

pub fn uptime_secs() -> u64 {
    START.get().map(|t| t.elapsed().as_secs()).unwrap_or(0)
}

pub fn login_ok() {
    LOGIN_OK.fetch_add(1, Ordering::Relaxed);
}
pub fn login_fail() {
    LOGIN_FAIL.fetch_add(1, Ordering::Relaxed);
}

pub fn render(online: usize) -> String {
    let uptime = START.get().map(|t| t.elapsed().as_secs()).unwrap_or(0);
    let mut out = String::new();
    out.push_str("# HELP jing_requests_total HTTP requests by class\n");
    out.push_str("# TYPE jing_requests_total counter\n");
    out.push_str(&format!("jing_requests_total{{class=\"2xx\"}} {}\n", REQ_2XX.load(Ordering::Relaxed)));
    out.push_str(&format!("jing_requests_total{{class=\"4xx\"}} {}\n", REQ_4XX.load(Ordering::Relaxed)));
    out.push_str(&format!("jing_requests_total{{class=\"5xx\"}} {}\n", REQ_5XX.load(Ordering::Relaxed)));
    out.push_str("# HELP jing_login_total login attempts by result\n# TYPE jing_login_total counter\n");
    out.push_str(&format!("jing_login_total{{result=\"ok\"}} {}\n", LOGIN_OK.load(Ordering::Relaxed)));
    out.push_str(&format!("jing_login_total{{result=\"fail\"}} {}\n", LOGIN_FAIL.load(Ordering::Relaxed)));
    out.push_str("# HELP jing_ws_online Current websocket connections\n# TYPE jing_ws_online gauge\n");
    out.push_str(&format!("jing_ws_online {online}\n"));
    out.push_str("# HELP jing_process_uptime_seconds Server uptime\n# TYPE jing_process_uptime_seconds gauge\n");
    out.push_str(&format!("jing_process_uptime_seconds {uptime}\n"));
    out.push_str("# HELP jing_http_request_duration_ms Histogram buckets
# TYPE jing_http_request_duration_ms histogram\n");
    let mut cum = 0u64;
    for (i, b) in LAT_BUCKETS.iter().enumerate() {
        cum += LAT[i].load(Ordering::Relaxed);
        out.push_str(&format!("jing_http_request_duration_ms_bucket{{le=\"{b}\"}} {cum}\n"));
    }
    cum += LAT[9].load(Ordering::Relaxed);
    out.push_str(&format!("jing_http_request_duration_ms_bucket{{le=\"+Inf\"}} {cum}\n"));
    out.push_str(&format!("jing_http_request_duration_ms_sum {}
", 0));
    if let Some(map) = TOP_PATHS.get() {
        let g = map.lock().unwrap();
        let mut top: Vec<(&String, &u64)> = g.iter().collect();
        top.sort_by(|a, b| b.1.cmp(a.1));
        out.push_str("# HELP jing_errors_total Top erroring paths\n# TYPE jing_errors_total counter\n");
        for (p, n) in top.iter().take(10) {
            out.push_str(&format!("jing_errors_total{{path=\"{p}\"}} {n}\n"));
        }
    }
    out
}
