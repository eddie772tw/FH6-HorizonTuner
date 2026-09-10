#!/usr/bin/env python3
"""Convenience script entry for FH6-HorizonTuner Agent CLI."""

import os
import sys

# Ensure repository root and backend/ are in sys.path
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(REPO_ROOT, "backend")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.agent_cli import main

if __name__ == "__main__":
    sys.exit(main())
