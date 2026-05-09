"""Tests for engine/crypto.py PII encryption (PyNaCl SealedBox)."""
from __future__ import annotations

import base64

import pytest

from engine.crypto import decrypt_pii, encrypt_pii, generate_keypair


class TestKeypair:
    def test_returns_two_base64_strings(self):
        pub, priv = generate_keypair()
        assert isinstance(pub, str) and isinstance(priv, str)
        base64.b64decode(pub)   # raises if invalid
        base64.b64decode(priv)

    def test_public_and_private_differ(self):
        pub, priv = generate_keypair()
        assert pub != priv

    def test_each_call_unique(self):
        assert generate_keypair()[0] != generate_keypair()[0]


class TestRoundtrip:
    def test_name(self):
        pub, priv = generate_keypair()
        assert decrypt_pii(encrypt_pii("Jane Smith", pub), priv) == "Jane Smith"

    def test_email(self):
        pub, priv = generate_keypair()
        assert decrypt_pii(encrypt_pii("jane@example.com", pub), priv) == "jane@example.com"

    def test_booking_ref(self):
        pub, priv = generate_keypair()
        assert decrypt_pii(encrypt_pii("ABC-123-XYZ", pub), priv) == "ABC-123-XYZ"

    def test_unicode(self):
        pub, priv = generate_keypair()
        text = "Ångström Zürich"
        assert decrypt_pii(encrypt_pii(text, pub), priv) == text

    def test_sealed_box_nondeterministic(self):
        """SealedBox uses ephemeral keys — two encryptions of the same value differ."""
        pub, _ = generate_keypair()
        assert encrypt_pii("same", pub) != encrypt_pii("same", pub)

    def test_wrong_key_raises(self):
        pub, _ = generate_keypair()
        _, priv2 = generate_keypair()
        with pytest.raises(Exception):
            decrypt_pii(encrypt_pii("secret", pub), priv2)
