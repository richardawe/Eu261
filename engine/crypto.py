"""PII field encryption/decryption using libsodium SealedBox (PyNaCl).

SealedBox is anonymous-sender: the intake workflow needs only the public key.
The private key is held offline by the operator and never enters CI.

Key encoding: standard base64.
"""
from __future__ import annotations

import base64

import nacl.public


def generate_keypair() -> tuple[str, str]:
    """Return (public_key_b64, private_key_b64) as base64 strings."""
    kp = nacl.public.PrivateKey.generate()
    return (
        base64.b64encode(bytes(kp.public_key)).decode(),
        base64.b64encode(bytes(kp)).decode(),
    )


def encrypt_pii(plaintext: str, public_key_b64: str) -> str:
    """Encrypt *plaintext* with *public_key_b64*. Returns base64 ciphertext."""
    pub = nacl.public.PublicKey(base64.b64decode(public_key_b64))
    return base64.b64encode(
        nacl.public.SealedBox(pub).encrypt(plaintext.encode())
    ).decode()


def decrypt_pii(ciphertext_b64: str, private_key_b64: str) -> str:
    """Decrypt *ciphertext_b64* with *private_key_b64*. Returns plaintext."""
    priv = nacl.public.PrivateKey(base64.b64decode(private_key_b64))
    return nacl.public.SealedBox(priv).decrypt(
        base64.b64decode(ciphertext_b64)
    ).decode()
