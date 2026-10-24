<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit();

include 'db_connect.php'; // Ensure this connects to your mro_warehouse db

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (isset($data['racks'])) {
    $json = json_encode($data['racks']);
    // Save to app_settings table (key: 'map_layout')
    $stmt = $pdo->prepare("REPLACE INTO app_settings (setting_key, setting_value) VALUES ('map_layout', ?)");
    $stmt->execute([$json]);
    echo json_encode(['success' => true, 'message' => 'Layout saved']);
} else {
    echo json_encode(['success' => false, 'message' => 'No rack data']);
}
?>