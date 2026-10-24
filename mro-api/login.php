<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$host = '127.0.0.1';
$db   = 'mro_warehouse';
$user = 'root';
$pass = ''; 
$charset = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
try {
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (\PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database connection failed']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
$email = $data['email'] ?? '';
$password = $data['password'] ?? '';

if (!$email || !$password) {
    echo json_encode(['success' => false, 'message' => 'Email and password required']);
    exit;
}

// 1. Fetch the user details + the HASHED password
$stmt = $pdo->prepare("SELECT id, email, password, role, name FROM users WHERE email = ?");
$stmt->execute([$email]);
$user = $stmt->fetch();

// 2. Use password_verify to compare the input vs the hash in DB
if ($user && password_verify($password, $user['password'])) {
    
    // Remove password from the response data for security
    unset($user['password']);

    echo json_encode([
        'success' => true,
        'message' => 'Login successful',
        'user' => $user
    ]);
} else {
    echo json_encode(['success' => false, 'message' => 'Invalid email or password']);
}
?>
