<?php
// Standard headers for all files
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

// Connect DB
$host = '127.0.0.1'; $db = 'mro_warehouse'; $user = 'root'; $pass = '';
try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8mb4", $user, $pass);
    // Fetch all users except password
    $stmt = $pdo->query("SELECT id, email, role, name FROM users ORDER BY id DESC");
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['success' => true, 'users' => $users]);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
?>