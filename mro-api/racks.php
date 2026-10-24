<?php
include 'db_connect.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $result = $conn->query("SELECT setting_value FROM app_settings WHERE setting_key = 'rackDetails'");
    if ($result->num_rows > 0) {
        $row = $result->fetch_assoc();
        echo $row['setting_value'] ? $row['setting_value'] : "{}";
    } else {
        echo "{}";
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents("php://input");
    if (!$input) { exit(); }

    $escapedJson = $conn->real_escape_string($input);
    
    // Force Save (Create row if missing, Update if exists)
    $sql = "INSERT INTO app_settings (setting_key, setting_value) 
            VALUES ('rackDetails', '$escapedJson') 
            ON DUPLICATE KEY UPDATE setting_value = '$escapedJson'";

    if ($conn->query($sql)) {
        echo json_encode(["success" => true]);
    } else {
        http_response_code(500);
        echo json_encode(["success" => false, "error" => $conn->error]);
    }
}
?>