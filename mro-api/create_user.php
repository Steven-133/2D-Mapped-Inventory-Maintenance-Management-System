<?php
// --- 1. HEADERS (Fixes CORS & Connection Errors) ---
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

// Handle Preflight Request from React
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// --- 2. DATABASE CONNECTION ---
$host = '127.0.0.1';
$db   = 'mro_warehouse';
$user = 'root';
$pass = ''; // Default XAMPP password is empty
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

// --- 3. PROCESS DATA ---
// Get JSON input from React
$input = file_get_contents('php://input');
$data = json_decode($input, true);

// Validate Input
$email = $data['email'] ?? '';
$password = $data['password'] ?? '';
$role = $data['role'] ?? 'user';
$name = $data['name'] ?? '';

if (empty($email) || empty($password)) {
    echo json_encode(['success' => false, 'message' => 'Email and Password are required.']);
    exit;
}

try {
    // A. Check if email already exists
    $checkStmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
    $checkStmt->execute([$email]);
    
    if ($checkStmt->fetch()) {
        echo json_encode(['success' => false, 'message' => 'Email already exists.']);
        exit;
    }

    // B. Insert New User
    // Note: In a real production app, use password_hash($password, PASSWORD_DEFAULT) here
    $sql = "INSERT INTO users (email, password, role, name) VALUES (?, ?, ?, ?)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$email, $password, $role, $name]);

    echo json_encode(['success' => true, 'message' => 'User created successfully.']);

} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => 'Error creating user: ' . $e->getMessage()]);
}
?>