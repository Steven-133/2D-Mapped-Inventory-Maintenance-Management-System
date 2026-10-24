<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

include 'db_connect.php';

// 1. Get Map Layout
$layoutStmt = $pdo->prepare("SELECT setting_value FROM app_settings WHERE setting_key = 'map_layout'");
$layoutStmt->execute();
$layoutRow = $layoutStmt->fetch();
$racks = $layoutRow ? json_decode($layoutRow['setting_value'], true) : [];

// 2. Get Inventory Counts per Rack (to calculate color)
// Assumes your inventory table has a 'rack' column
$invStmt = $pdo->query("SELECT rack, SUM(qty) as total_qty FROM inventory GROUP BY rack");
$inventoryCounts = $invStmt->fetchAll(PDO::FETCH_KEY_PAIR); // ['Rack A1' => 50, 'Rack B2' => 0]

echo json_encode([
    'success' => true, 
    'racks' => $racks,
    'counts' => $inventoryCounts
]);
?>