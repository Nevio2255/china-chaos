@echo off
title China Chaos
if not exist node_modules call npm install
call npm start
pause
