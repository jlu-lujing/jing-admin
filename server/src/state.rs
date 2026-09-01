use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::db::Db;

#[derive(Clone)]
pub struct AppState {
    pub db: Db,
    /// 令牌桶：key = 用户名或 IP -> (剩余令牌, 上次补充时刻秒)
    pub rate: Arc<Mutex<HashMap<String, (f64, f64)>>>,
}

impl AppState {
    pub fn new(db: Db) -> Self {
        Self { db, rate: Default::default() }
    }
}
