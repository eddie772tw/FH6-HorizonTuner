# FH6-HorizonTuner 🏎️
> **Forza Horizon 6 Real-Time Telemetry Analyzer, Vehicle Tuning Workbench & Custom Racing Dashboard Overlay**

[![Language](https://img.shields.io/badge/backend-Rust-orange.svg)](https://www.rust-lang.org/)
[![Frontend](https://img.shields.io/badge/Frontend-Tauri%20v2%20%2B%20React-purple.svg)](https://tauri.app/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Distribution](https://img.shields.io/badge/Distribution-Pure%20Native%20EXE-blue.svg)](build_release.bat)

---

## Introduction

`FH6-HorizonTuner` is a real-time telemetry analyzer and vehicle tuning tool designed for *Forza Horizon 6*. Powered by a **Pure Rust (Tauri v2)** backend, it delivers zero-overhead UDP 60Hz+ packet parsing, pure-function physics calculations, and ultra-low latency.

Features include **Live Telemetry**, **Custom Dashboard Overlay**, **Tuning Workbench**, and **Drag Start Testing**.

---

## Quick Start

### 1. In-Game Telemetry Setup
1. Go to **Settings** -> **HUD and Gameplay**.
2. Turn **Data Out** **ON**.
3. Set **Data Out IP Address** to `127.0.0.1`.
4. Set **Data Out Port** to `8000`.

### 2. Launching
* Double click **`start_all.bat`** to start the development workspace.
* Double click **`build_release.bat`** to build the standalone native `.exe`.