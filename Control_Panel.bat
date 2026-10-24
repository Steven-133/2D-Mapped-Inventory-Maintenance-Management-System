@echo off
if exist "C:\xampp\xampp-control.exe" (
    start "" "C:\xampp\xampp-control.exe"
) else if exist "D:\Apps\xampp\xampp-control.exe" (
    start "" "D:\Apps\xampp\xampp-control.exe"
) else (
    echo XAMPP Control Panel not found!
    pause
)

