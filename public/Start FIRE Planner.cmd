@echo off
rem Starts the FIRE Planner from this folder and opens it in your browser.
rem Keep the window that opens; close it to stop the planner.
title FIRE Planner
mode con: cols=66 lines=26 >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
