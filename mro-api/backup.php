<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST");
header("Content-Type: application/json");

// --- 1. CONFIGURATION ---
$host = "localhost";
$user = "root";       // Default XAMPP user
$pass = "";           // Default XAMPP password
$dbname = "mro_warehouse";

// --- 2. YOUR SPECIFIC BACKUP PATH ---
// We use forward slashes (/) to prevent Windows path errors in PHP
$driveFolder = "C:/Users/Aldrich Malapajo/OneDrive/Backup/"; 

// --- 3. MYSQLDUMP PATH ---
// Verify this path exists on your computer. This is the default for XAMPP.
$mysqldumpPath = "C:/xampp/mysql/bin/mysqldump.exe";

// ----------------------

try {
    // Check if the folder exists, if not, try to create it
    if (!is_dir($driveFolder)) {
        if (!mkdir($driveFolder, 0777, true)) {
            throw new Exception("Could not find or create folder: $driveFolder");
        }
    }

    // Define Filename (e.g., mro_backup_2024-02-15_week07.sql)
    $date = date('Y-m-d');
    $week = date('W'); // Week number (01-52)
    $filename = "mro_backup_{$date}_week{$week}.sql";
    $fullPath = $driveFolder . $filename;

    // Check if mysqldump exists before running
    if (!file_exists($mysqldumpPath)) {
        throw new Exception("mysqldump.exe not found at $mysqldumpPath");
    }

    // Execute Backup Command
    // Syntax: mysqldump --user=... --password=... --host=... dbname > "path/to/file.sql"
    $command = "\"$mysqldumpPath\" --user=$user --password=$pass --host=$host $dbname > \"$fullPath\"";

    $output = [];
    $returnVar = null;
    exec($command, $output, $returnVar);

    if ($returnVar === 0) {
        // SUCCESS
        echo json_encode([
            "success" => true, 
            "message" => "Database saved to OneDrive Backup folder.",
            "path" => $fullPath
        ]);
    } else {
        // FAILURE
        throw new Exception("Backup failed (Error Code $returnVar). Check permissions or mysqldump path.");
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => $e->getMessage()]);
}
?>