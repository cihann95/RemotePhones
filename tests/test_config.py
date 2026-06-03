"""Tests for config.loader — load_config, validation, defaults, YAML parsing."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from config.loader import load_config


# ── load_config with default path ─────────────────────────────────────────────


class TestLoadConfigDefaultPath:
    """load_config() with no arguments — loads config/phone_farm.yaml."""

    def test_loads_default_config(self):
        """Default config file exists and returns expected top-level keys."""
        cfg = load_config()
        assert isinstance(cfg, dict)
        assert "adb" in cfg
        assert "scheduler" in cfg
        assert "monitor" in cfg
        assert "devices" in cfg

    def test_devices_is_list(self):
        cfg = load_config()
        assert isinstance(cfg["devices"], list)

    def test_default_adb_values(self):
        cfg = load_config()
        assert cfg["adb"]["adb_path"] == "adb"
        assert cfg["adb"]["default_device"] is None

    def test_default_scheduler_values(self):
        cfg = load_config()
        assert cfg["scheduler"]["poll_interval_s"] == 1.0
        assert cfg["scheduler"]["max_retries"] == 3
        assert cfg["scheduler"]["retry_delay_base_s"] == 5.0

    def test_default_monitor_values(self):
        cfg = load_config()
        assert cfg["monitor"]["health_check_interval_s"] == 60.0
        assert cfg["monitor"]["battery_low_pct"] == 15
        assert cfg["monitor"]["temperature_high_c"] == 50
        assert cfg["monitor"]["memory_high_pct"] == 90


# ── load_config with custom path ──────────────────────────────────────────────


class TestLoadConfigCustomPath:
    """load_config(path=...) with explicitly provided YAML files."""

    def test_loads_valid_yaml(self, tmp_path: Path):
        config = {
            "adb": {"adb_path": "/usr/bin/adb", "default_device": "dev-1"},
            "scheduler": {
                "poll_interval_s": 2.0,
                "max_retries": 5,
                "retry_delay_base_s": 10.0,
            },
            "monitor": {
                "health_check_interval_s": 120,
                "battery_low_pct": 20,
                "temperature_high_c": 45,
                "memory_high_pct": 85,
            },
            "devices": [{"serial": "abc123", "name": "Test Device"}],
        }
        cfg_path = tmp_path / "test_config.yaml"
        with open(cfg_path, "w") as f:
            yaml.dump(config, f)

        result = load_config(str(cfg_path))

        assert result["adb"]["adb_path"] == "/usr/bin/adb"
        assert result["adb"]["default_device"] == "dev-1"
        assert result["scheduler"]["poll_interval_s"] == 2.0
        assert result["scheduler"]["max_retries"] == 5
        assert result["scheduler"]["retry_delay_base_s"] == 10.0
        assert result["monitor"]["health_check_interval_s"] == 120
        assert result["monitor"]["battery_low_pct"] == 20
        assert result["monitor"]["temperature_high_c"] == 45
        assert result["monitor"]["memory_high_pct"] == 85
        assert result["devices"] == [{"serial": "abc123", "name": "Test Device"}]

    def test_environment_variable_path(self, tmp_path: Path, monkeypatch):
        """PHONE_FARM_CONFIG env var is used when no explicit path is given."""
        config = {"adb": {"adb_path": "/env/adb"}}
        cfg_path = tmp_path / "env_config.yaml"
        with open(cfg_path, "w") as f:
            yaml.dump(config, f)

        monkeypatch.setenv("PHONE_FARM_CONFIG", str(cfg_path))
        result = load_config()

        assert result["adb"]["adb_path"] == "/env/adb"

    def test_explicit_path_overrides_env(self, tmp_path: Path, monkeypatch):
        """Explicit path argument takes priority over PHONE_FARM_CONFIG."""
        explicit_cfg = {"adb": {"adb_path": "/explicit/adb"}}
        env_cfg = {"adb": {"adb_path": "/env/adb"}}

        explicit_path = tmp_path / "explicit.yaml"
        env_path = tmp_path / "env.yaml"

        with open(explicit_path, "w") as f:
            yaml.dump(explicit_cfg, f)
        with open(env_path, "w") as f:
            yaml.dump(env_cfg, f)

        monkeypatch.setenv("PHONE_FARM_CONFIG", str(env_path))
        result = load_config(str(explicit_path))

        assert result["adb"]["adb_path"] == "/explicit/adb"


# ── Config defaults ───────────────────────────────────────────────────────────


class TestConfigDefaults:
    """When optional fields/sections are omitted, pydantic defaults are filled."""

    def test_minimal_config_gets_defaults(self, tmp_path: Path):
        """Only adb_path set; scheduler, monitor, devices all get defaults."""
        config = {"adb": {"adb_path": "/custom/adb"}}
        cfg_path = tmp_path / "minimal.yaml"
        with open(cfg_path, "w") as f:
            yaml.dump(config, f)

        result = load_config(str(cfg_path))

        assert result["adb"]["adb_path"] == "/custom/adb"
        assert result["adb"]["default_device"] is None
        assert result["scheduler"]["poll_interval_s"] == 1.0
        assert result["scheduler"]["max_retries"] == 3
        assert result["scheduler"]["retry_delay_base_s"] == 5.0
        assert result["monitor"]["health_check_interval_s"] == 60.0
        assert result["monitor"]["battery_low_pct"] == 15
        assert result["monitor"]["temperature_high_c"] == 50
        assert result["monitor"]["memory_high_pct"] == 90
        assert result["devices"] == []

    def test_empty_yaml_uses_all_defaults(self, tmp_path: Path):
        """An entirely empty config dict gets fully defaulted."""
        cfg_path = tmp_path / "empty.yaml"
        with open(cfg_path, "w") as f:
            yaml.dump({}, f)

        result = load_config(str(cfg_path))

        assert result["adb"]["adb_path"] == "adb"
        assert result["adb"]["default_device"] is None
        assert result["scheduler"]["poll_interval_s"] == 1.0
        assert result["scheduler"]["max_retries"] == 3
        assert result["monitor"]["temperature_high_c"] == 50
        assert result["devices"] == []

    def test_partial_section_merges_defaults(self, tmp_path: Path):
        """Only some fields in a section → missing fields use defaults."""
        config = {"scheduler": {"poll_interval_s": 5.0}}
        cfg_path = tmp_path / "partial.yaml"
        with open(cfg_path, "w") as f:
            yaml.dump(config, f)

        result = load_config(str(cfg_path))

        assert result["scheduler"]["poll_interval_s"] == 5.0
        assert result["scheduler"]["max_retries"] == 3
        assert result["scheduler"]["retry_delay_base_s"] == 5.0

    def test_null_devices_becomes_empty_list(self, tmp_path: Path):
        """When devices is explicitly null, the validator converts to []."""
        config = {"devices": None}
        cfg_path = tmp_path / "null_devices.yaml"
        with open(cfg_path, "w") as f:
            yaml.dump(config, f)

        result = load_config(str(cfg_path))

        assert result["devices"] == []

    def test_omitted_devices_key_becomes_empty_list(self, tmp_path: Path):
        """When devices key is entirely absent, default_factory provides []."""
        config = {"adb": {"adb_path": "adb"}}
        cfg_path = tmp_path / "no_devices.yaml"
        with open(cfg_path, "w") as f:
            yaml.dump(config, f)

        result = load_config(str(cfg_path))

        assert result["devices"] == []


# ── Config validation errors ──────────────────────────────────────────────────


class TestConfigValidationErrors:
    """Invalid field values should raise ValueError via pydantic validation."""

    @staticmethod
    def _write_config(tmp_path: Path, data: dict) -> Path:
        path = tmp_path / "invalid.yaml"
        with open(path, "w") as f:
            yaml.dump(data, f)
        return path

    def test_negative_poll_interval(self, tmp_path: Path):
        cfg = self._write_config(tmp_path, {"scheduler": {"poll_interval_s": -1}})
        with pytest.raises(ValueError, match="Config validation failed"):
            load_config(str(cfg))

    def test_zero_poll_interval(self, tmp_path: Path):
        """poll_interval_s must be > 0."""
        cfg = self._write_config(tmp_path, {"scheduler": {"poll_interval_s": 0}})
        with pytest.raises(ValueError, match="Config validation failed"):
            load_config(str(cfg))

    def test_negative_max_retries(self, tmp_path: Path):
        """max_retries must be >= 0."""
        cfg = self._write_config(tmp_path, {"scheduler": {"max_retries": -5}})
        with pytest.raises(ValueError, match="Config validation failed"):
            load_config(str(cfg))

    def test_negative_retry_delay(self, tmp_path: Path):
        """retry_delay_base_s must be > 0."""
        cfg = self._write_config(tmp_path, {"scheduler": {"retry_delay_base_s": -3}})
        with pytest.raises(ValueError, match="Config validation failed"):
            load_config(str(cfg))

    def test_battery_pct_too_high(self, tmp_path: Path):
        """battery_low_pct must be <= 100."""
        cfg = self._write_config(tmp_path, {"monitor": {"battery_low_pct": 150}})
        with pytest.raises(ValueError, match="Config validation failed"):
            load_config(str(cfg))

    def test_battery_pct_negative(self, tmp_path: Path):
        """battery_low_pct must be >= 0."""
        cfg = self._write_config(tmp_path, {"monitor": {"battery_low_pct": -5}})
        with pytest.raises(ValueError, match="Config validation failed"):
            load_config(str(cfg))

    def test_memory_pct_too_high(self, tmp_path: Path):
        """memory_high_pct must be <= 100."""
        cfg = self._write_config(tmp_path, {"monitor": {"memory_high_pct": 101}})
        with pytest.raises(ValueError, match="Config validation failed"):
            load_config(str(cfg))

    def test_negative_health_check_interval(self, tmp_path: Path):
        """health_check_interval_s must be > 0."""
        cfg = self._write_config(tmp_path, {"monitor": {"health_check_interval_s": -10}})
        with pytest.raises(ValueError, match="Config validation failed"):
            load_config(str(cfg))


# ── Invalid YAML ──────────────────────────────────────────────────────────────


class TestInvalidYaml:
    """Malformed YAML content or missing files."""

    def test_malformed_yaml_raises(self, tmp_path: Path):
        cfg_path = tmp_path / "malformed.yaml"
        with open(cfg_path, "w") as f:
            f.write("adb: [unclosed list\n")

        with pytest.raises(yaml.YAMLError):
            load_config(str(cfg_path))

    def test_scalar_yaml_raises(self, tmp_path: Path):
        """A YAML scalar (string instead of dict) fails pydantic validation."""
        cfg_path = tmp_path / "scalar.yaml"
        with open(cfg_path, "w") as f:
            f.write("just a string")

        with pytest.raises(ValueError, match="Config validation failed"):
            load_config(str(cfg_path))

    def test_missing_file_falls_back_to_default(self):
        """A non-existent explicit path falls through to the default config."""
        result = load_config("/nonexistent/path/that/does/not/exist.yaml")
        # Since the default config/phone_farm.yaml exists, it should load that
        assert isinstance(result, dict)
        assert "adb" in result
        assert "scheduler" in result
        assert "monitor" in result
