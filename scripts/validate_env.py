#!/usr/bin/env python3
"""
validate_env.py — Environment Variable Validator for MediFlow Enterprise
Validates a .env file against config/env.schema.json and reports missing/invalid variables.

Usage:
    python scripts/validate_env.py config/environments/prod.env
    python scripts/validate_env.py config/environments/dev.env
    python scripts/validate_env.py .env
"""

import json
import re
import sys
import io
from pathlib import Path

# Fix Windows console encoding for emoji output
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')


def load_schema() -> dict:
    schema_path = Path(__file__).parent.parent / "config" / "env.schema.json"
    if not schema_path.exists():
        print(f"❌ Schema file not found: {schema_path}")
        sys.exit(1)
    with open(schema_path) as f:
        return json.load(f)


def parse_env_file(filepath: str) -> dict:
    env = {}
    with open(filepath) as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' not in line:
                continue
            key, _, value = line.partition('=')
            env[key.strip()] = value.strip()
    return env


def validate(env: dict, schema: dict) -> tuple:
    errors = []
    warnings = []

    required = schema.get("required", [])
    properties = schema.get("properties", {})

    # Check required variables
    for var in required:
        if var not in env:
            errors.append(f"🔴 MISSING required: {var}")
        elif not env[var] or env[var].startswith("REPLACE_"):
            errors.append(f"🔴 PLACEHOLDER value: {var} = '{env[var]}'")

    # Validate each present variable
    for var, value in env.items():
        if var not in properties:
            warnings.append(f"🟡 Unknown variable: {var} (not in schema)")
            continue

        rules = properties[var]

        # Type check
        if rules.get("type") == "integer":
            try:
                int(value)
            except ValueError:
                errors.append(f"🔴 INVALID type: {var} = '{value}' (expected integer)")

        # Enum check
        if "enum" in rules:
            if value not in [str(e) for e in rules["enum"]]:
                errors.append(f"🔴 INVALID value: {var} = '{value}' (expected one of: {rules['enum']})")

        # Pattern check
        if "pattern" in rules:
            if not re.match(rules["pattern"], value):
                errors.append(f"🔴 INVALID format: {var} (does not match pattern: {rules['pattern']})")

        # MinLength check
        if "minLength" in rules:
            if len(value) < rules["minLength"]:
                errors.append(f"🔴 TOO SHORT: {var} (minimum {rules['minLength']} chars, got {len(value)})")

    return errors, warnings


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/validate_env.py <env_file>")
        print("Example: python scripts/validate_env.py config/environments/prod.env")
        sys.exit(1)

    env_file = sys.argv[1]
    if not Path(env_file).exists():
        print(f"❌ File not found: {env_file}")
        sys.exit(1)

    schema = load_schema()
    env = parse_env_file(env_file)

    print(f"\n{'='*60}")
    print(f"  MediFlow Environment Validator")
    print(f"  File: {env_file}")
    print(f"  Variables found: {len(env)}")
    print(f"{'='*60}\n")

    errors, warnings = validate(env, schema)

    for w in warnings:
        print(f"  {w}")
    for e in errors:
        print(f"  {e}")

    print(f"\n{'─'*60}")
    print(f"  Results: {len(errors)} errors, {len(warnings)} warnings")
    print(f"{'─'*60}\n")

    if errors:
        print("❌ VALIDATION FAILED — fix errors before deployment")
        sys.exit(1)
    else:
        print("✅ VALIDATION PASSED — environment is properly configured")
        sys.exit(0)


if __name__ == "__main__":
    main()
