<?php
// --- ENABLE ERROR REPORTING ---
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('log_errors', 1);
ini_set('error_log', 'php_errors.log');

include 'db_connect.php';

// Add transaction_id column safely if it doesn't exist
$conn->query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100) NULL");

// --- HEADERS ---
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// --- HELPER: LOGGING ---
function writeLog($message) {
    file_put_contents('debug_log.txt', date('[Y-m-d H:i:s] ') . $message . PHP_EOL, FILE_APPEND);
}

// --- 1. GET TRANSACTIONS ---
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $check = $conn->query("SHOW TABLES LIKE 'transactions'");
    if($check->num_rows == 0) {
        echo json_encode([]);
        exit;
    }

    $sql = "SELECT * FROM transactions ORDER BY trans_date DESC";
    $result = $conn->query($sql);
    
    $data = [];
    if ($result) {
        while($row = $result->fetch_assoc()) {
            $data[] = [
                'id' => $row['trans_id'],
                'transaction_id' => $row['transaction_id'] ?? '-',
                'date' => date("n/j/Y, g:i:s A", strtotime($row['trans_date'])), 
                'action' => $row['action_type'], 
                'status' => $row['action_type'],
                'model' => $row['item_model'],
                'name' => $row['item_name'],
                'qty' => $row['quantity'],
                'unit' => $row['unit'],
                'cat' => $row['category'],
                'rack' => $row['rack_loc'],
                'zone' => $row['zone_loc'],
                'updatedBy' => $row['performed_by'],
                'serialNum' => $row['serial_num'],
                'notes' => $row['notes'],
                'details' => $row['notes'], 
                'report' => $row['notes']   
            ];
        }
    } else {
        writeLog("GET Error: " . $conn->error);
    }
    echo json_encode($data);
    exit;
}

// --- 2. SAVE TRANSACTION ---
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);

    if ($input) {
        // --- HANDLE BULK UPDATE FOR TRANSACTION IDs ---
        if (isset($input['action']) && $input['action'] === 'update_transaction_ids') {
            $t_id = $conn->real_escape_string($input['transaction_id']);
            $log_ids = $input['log_ids'];
            
            if (is_array($log_ids) && count($log_ids) > 0) {
                $escaped_ids = array_map(function($id) use ($conn) {
                    return "'" . $conn->real_escape_string($id) . "'";
                }, $log_ids);
                $id_string = implode(',', $escaped_ids);
                
                $sql = "UPDATE transactions SET transaction_id = '$t_id' WHERE trans_id IN ($id_string)";
                if ($conn->query($sql)) {
                    echo json_encode(["success" => true]);
                } else {
                    echo json_encode(["success" => false, "error" => $conn->error]);
                }
            } else {
                echo json_encode(["success" => true]);
            }
            exit;
        }

        // --- HANDLE NORMAL INSERT ---
        $model = $conn->real_escape_string($input['model'] ?? '');
        $name = $conn->real_escape_string($input['name'] ?? '');
        $action = $conn->real_escape_string($input['action'] ?? ($input['status'] ?? 'Log'));
        $qty = intval($input['qty'] ?? 0);
        $unit = $conn->real_escape_string($input['unit'] ?? 'pcs');
        $cat = $conn->real_escape_string($input['cat'] ?? '');
        $rack = $conn->real_escape_string($input['rack'] ?? 'Unplaced');
        $zone = $conn->real_escape_string($input['zone'] ?? 'Unplaced');
        $serial = $conn->real_escape_string($input['serialNum'] ?? '');
        $notes = $conn->real_escape_string($input['details'] ?? ($input['report'] ?? ($input['notes'] ?? '')));
        
        $userRaw = $input['updatedBy'] ?? ($input['user'] ?? 'System');
        if (is_array($userRaw) || (is_string($userRaw) && strpos($userRaw, '{') === 0)) {
            $uObj = is_array($userRaw) ? $userRaw : json_decode($userRaw, true);
            $userRaw = $uObj['name'] ?? ($uObj['username'] ?? 'System');
        }
        $user = $conn->real_escape_string($userRaw);

        // Handle specific trans_id UUID if frontend sent one, otherwise database generates it
        $trans_id_clause = "";
        $trans_id_value = "";
        if (isset($input['id'])) {
            $trans_id = $conn->real_escape_string($input['id']);
            $trans_id_clause = "trans_id, ";
            $trans_id_value = "'$trans_id', ";
        }

        $sql = "INSERT INTO transactions 
                ($trans_id_clause item_model, item_name, action_type, quantity, unit, category, rack_loc, zone_loc, performed_by, serial_num, notes, trans_date)
                VALUES 
                ($trans_id_value '$model', '$name', '$action', $qty, '$unit', '$cat', '$rack', '$zone', '$user', '$serial', '$notes', NOW())";

        if ($conn->query($sql)) {
            writeLog("Success: Saved $action for $name");
            echo json_encode(["success" => true]);
        } else {
            writeLog("DB Error: " . $conn->error);
            http_response_code(500);
            echo json_encode(["success" => false, "error" => $conn->error]);
        }
    } else {
        writeLog("Input Error: Invalid JSON");
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Invalid JSON"]);
    }
    exit;
}
?>