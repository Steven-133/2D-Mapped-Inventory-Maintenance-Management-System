<?php
// --- 1. HEADERS (Fixes CORS & Input Issues) ---
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

// Handle Preflight Request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// --- 2. DATABASE CONNECTION ---
$host = '127.0.0.1';
$db   = 'mro_warehouse';
$user = 'root';
$pass = ''; 
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (\PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

// --- 3. PROCESS DELETE REQUEST ---
$input = file_get_contents('php://input');
$data = json_decode($input, true);

$id = $data['id'] ?? '';

if (empty($id)) {
    echo json_encode(['success' => false, 'message' => 'User ID is required.']);
    exit;
}

try {
    // Prevent deleting the main admin/root user manually if needed (Optional safety)
    if ($id == 1) { 
        echo json_encode(['success' => false, 'message' => 'Cannot delete the Root Admin.']);
        exit;
    }

    $stmt = $pdo->prepare("DELETE FROM users WHERE id = ?");
    $stmt->execute([$id]);

    if ($stmt->rowCount() > 0) {
        echo json_encode(['success' => true, 'message' => 'User deleted successfully.']);
    } else {
        echo json_encode(['success' => false, 'message' => 'User not found or already deleted.']);
    }

} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => 'SQL Error: ' . $e->getMessage()]);
}
?>