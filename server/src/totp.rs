use hmac::{Hmac, Mac};
use sha1::Sha1;

type HmacSha1 = Hmac<Sha1>;

pub fn generate_secret() -> String {
    let mut bytes = [0u8; 20];
    rand::RngCore::fill_bytes(&mut rand::rng(), &mut bytes);
    base32::encode(base32::Alphabet::Rfc4648 { padding: false }, &bytes)
}

fn code_at(secret_b32: &str, counter: u64) -> Option<String> {
    let key = base32::decode(base32::Alphabet::Rfc4648 { padding: false }, secret_b32)?;
    let mut mac = HmacSha1::new_from_slice(&key).ok()?;
    mac.update(&counter.to_be_bytes());
    let result = mac.finalize().into_bytes();
    let off = (result[result.len() - 1] & 0x0f) as usize;
    let val = ((result[off] & 0x7f) as u32) << 24
        | (result[off + 1] as u32) << 16
        | (result[off + 2] as u32) << 8
        | result[off + 3] as u32;
    Some(format!("{:06}", val % 1_000_000))
}

/// 验证，允许前后各一个 30s 窗口
pub fn verify(secret_b32: &str, code: &str) -> bool {
    let step = chrono::Utc::now().timestamp() / 30;
    (-1..=1).any(|d| code_at(secret_b32, (step + d) as u64).as_deref() == Some(code))
}

pub fn otpauth_uri(username: &str, secret: &str) -> String {
    format!("otpauth://totp/JingAdmin:{username}?secret={secret}&issuer=JingAdmin&period=30&digits=6")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn totp_roundtrip() {
        let secret = generate_secret();
        let step = chrono::Utc::now().timestamp() / 30;
        let code = code_at(&secret, step as u64).unwrap();
        assert!(verify(&secret, &code));
        assert!(!verify(&secret, "000001x"));
    }
}
