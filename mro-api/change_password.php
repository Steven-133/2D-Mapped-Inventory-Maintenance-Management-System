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
$input = file_get_contents('php://input');
$data = json_decode($input, true);

$email = $data['email'] ?? '';
$oldPassword = $data['currentPassword'] ?? ''; // React likely sends 'currentPassword'
$newPassword = $data['newPassword'] ?? '';

if (empty($email) || empty($oldPassword) || empty($newPassword)) {
    echo json_encode(['success' => false, 'message' => 'All fields are required.']);
    exit;
}

try {
    // A. Verify the user exists and the OLD password is correct
    $stmt = $pdo->prepare("SELECT id, password FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user) {
        echo json_encode(['success' => false, 'message' => 'User not found.']);
        exit;
    }

    // Check if old password matches
    // NOTE: If you are using plain text passwords (as per previous examples), use direct comparison:
    if ($user['password'] !== $oldPassword) {
        // If you were using hashing, you would use: if (!password_verify($oldPassword, $user['password']))
        echo json_encode(['success' => false, 'message' => 'Incorrect current password.']);
        exit;
    }

    // B. Update to the NEW password
    $updateStmt = $pdo->prepare("UPDATE users SET password = ? WHERE email = ?");
    $updateStmt->execute([$newPassword, $email]);

    echo json_encode(['success' => true, 'message' => 'Password changed successfully.']);

} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => 'Error changing password: ' . $e->getMessage()]);
}
?>