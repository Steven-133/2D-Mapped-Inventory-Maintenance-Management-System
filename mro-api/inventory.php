<?php
// --- DB CONNECTION & ERROR HANDLING ---
error_reporting(E_ALL);
ini_set('display_errors', 0); // Hide errors from output to prevent JSON breakage
include 'db_connect.php';

// --- CORS HEADERS ---
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

$method = $_SERVER['REQUEST_METHOD'];

// Handle Preflight
if ($method === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// --- GET ALL ITEMS (WITH AUTO-REPAIR FOR LOCATIONS) ---
if ($method === 'GET') {
    // This query tries to find the location in the inventory table first.
    // If it's missing ('Unplaced' or empty), it looks for the most recent valid location in the transactions table.
    $sql = "SELECT 
                i.*,
                COALESCE(
                    NULLIF(i.rack_loc, ''), 
                    NULLIF(i.rack_loc, 'Unplaced'),
                    (
                        SELECT t.rack_loc 
                        FROM transactions t 
                        WHERE (t.serial_num = i.serial_num AND i.serial_num != '' AND i.serial_num IS NOT NULL)
                           OR (t.item_model = i.model)
                        AND t.rack_loc IS NOT NULL 
                        AND t.rack_loc != '' 
                        AND t.rack_loc != 'Unplaced'
                        ORDER BY t.trans_date DESC 
                        LIMIT 1
                    ),
                    'Unplaced'
                ) AS effective_rack,
                COALESCE(
                    NULLIF(i.zone_loc, ''), 
                    NULLIF(i.zone_loc, 'Unplaced'),
                    (
                        SELECT t.zone_loc 
                        FROM transactions t 
                        WHERE (t.serial_num = i.serial_num AND i.serial_num != '' AND i.serial_num IS NOT NULL)
                           OR (t.item_model = i.model)
                        AND t.zone_loc IS NOT NULL 
                        AND t.zone_loc != '' 
                        AND t.zone_loc != 'Unplaced'
                        ORDER BY t.trans_date DESC 
                        LIMIT 1
                    ),
                    'Unplaced'
                ) AS effective_zone
            FROM inventory i 
            ORDER BY i.date_added DESC";

    $result = $conn->query($sql);
    
    $data = [];
    if ($result) {
        while($row = $result->fetch_assoc()) {
            // Overwrite the empty 'rack_loc' with the found 'effective_rack'
            $row['rack_loc'] = $row['effective_rack'];
            $row['zone_loc'] = $row['effective_zone'];
            
            // Also set 'rack' and 'zone' aliases to ensure frontend compatibility
            $row['rack'] = $row['effective_rack'];
            $row['zone'] = $row['effective_zone'];
            
            $data[] = $row;
        }
    }
    echo json_encode($data);
    exit;
}

// --- ADD / UPDATE / ARCHIVE / CHECKOUT ---
if ($method === 'POST') {
    $input = json_decode(file_get_contents("php://input"), true);
    
    if (!$input) {
        echo json_encode(["success" => false, "message" => "Invalid JSON"]);
        exit;
    }

    $action = isset($input['action']) ? $input['action'] : '';

    // --- 1. ARCHIVE ITEM ---
    if ($action === 'archive') {
        $id = $conn->real_escape_string($input['id']);
        $sql = "UPDATE inventory SET status='archived' WHERE id='$id'";
        if ($conn->query($sql)) {
            echo json_encode(["success" => true]);
        } else {
            echo json_encode(["success" => false, "error" => $conn->error]);
        }
        exit;
    }

    // --- 2. RESTORE ITEM ---
    if ($action === 'restore') {
        $id = $conn->real_escape_string($input['id']);
        $sql = "UPDATE inventory SET status='active' WHERE id='$id'";
        if ($conn->query($sql)) {
            echo json_encode(["success" => true]);
        } else {
            echo json_encode(["success" => false, "error" => $conn->error]);
        }
        exit;
    }

    // --- 3. PERMANENT DELETE ---
    if ($action === 'delete') {
        $id = $conn->real_escape_string($input['id']);
        $sql = "DELETE FROM inventory WHERE id='$id'";
        if ($conn->query($sql)) {
            echo json_encode(["success" => true]);
        } else {
            echo json_encode(["success" => false, "error" => $conn->error]);
        }
        exit;
    }

    // --- 4. CHECKOUT (Reduce Qty) ---
    if ($action === 'checkout') {
        $id = $conn->real_escape_string($input['id']);
        $qtyOut = (int)$input['qty_out'];
        
        $sql = "UPDATE inventory SET qty = GREATEST(0, qty - $qtyOut) WHERE id='$id'";
        if ($conn->query($sql)) {
            echo json_encode(["success" => true]);
        } else {
            echo json_encode(["success" => false, "error" => $conn->error]);
        }
        exit;
    }

    // --- 5. CHECKIN (Increase Qty) ---
    if ($action === 'checkin') {
        $id = $conn->real_escape_string($input['id']);
        $qtyIn = (int)$input['qty_in'];
        
        $sql = "UPDATE inventory SET qty = qty + $qtyIn WHERE id='$id'";
        if ($conn->query($sql)) {
            echo json_encode(["success" => true]);
        } else {
            echo json_encode(["success" => false, "error" => $conn->error]);
        }
        exit;
    }

    // --- 6. DEFECTIVE (Report & Reduce Qty) ---
    if ($action === 'defective') {
        $id = $conn->real_escape_string($input['id']);
        $qtyDefective = (int)$input['qty_defective'];
        
        // Decrease main inventory
        $sql1 = "UPDATE inventory SET qty = GREATEST(0, qty - $qtyDefective) WHERE id='$id'";
        $conn->query($sql1);
        
        // Log in transactions (Optional but recommended)
        $notes = $conn->real_escape_string($input['notes'] ?? 'Defective Report');
        // Note: You would typically insert into transactions here too, 
        // but since we are only fixing inventory.php, we leave it simple.

        echo json_encode(["success" => true]);
        exit;
    }

    // --- 7. ADD OR UPDATE ITEM ---
    // Extract variables safely
    $id = isset($input['id']) ? $conn->real_escape_string($input['id']) : '';
    $model = isset($input['model']) ? $conn->real_escape_string($input['model']) : '';
    $name = isset($input['name']) ? $conn->real_escape_string($input['name']) : '';
    $qty = isset($input['qty']) ? (int)$input['qty'] : 0;
    $min_threshold = isset($input['min_threshold']) ? (int)$input['min_threshold'] : 5;
    $serial = isset($input['serialNum']) ? $conn->real_escape_string($input['serialNum']) : '';
    $cat = isset($input['cat']) ? $conn->real_escape_string($input['cat']) : 'General';
    $price = isset($input['price']) ? (float)$input['price'] : 0.00;
    $unit = isset($input['unit']) ? $conn->real_escape_string($input['unit']) : 'pcs';
    $rack = isset($input['rack']) ? $conn->real_escape_string($input['rack']) : 'Unplaced';
    $zone = isset($input['zone']) ? $conn->real_escape_string($input['zone']) : 'Unplaced';
    $image = isset($input['image']) ? $conn->real_escape_string($input['image']) : '';
    $currency = isset($input['currency']) ? $conn->real_escape_string($input['currency']) : 'PHP';
    $lifespan = isset($input['lifespan']) ? $conn->real_escape_string($input['lifespan']) : '';
    $status = isset($input['status']) ? $conn->real_escape_string($input['status']) : 'active';
    
    $dateAdded = date("Y-m-d H:i:s");

    // Check if item exists
    $checkQuery = $conn->query("SELECT id FROM inventory WHERE id = '$id'");
    
    if ($checkQuery && $checkQuery->num_rows > 0) {
        // UPDATE Existing
        $sql = "UPDATE inventory SET 
                model='$model', name='$name', qty=$qty, min_threshold=$min_threshold, 
                serial_num='$serial', category='$cat', price=$price, unit='$unit', 
                rack_loc='$rack', zone_loc='$zone', image='$image',
                currency='$currency', lifespan='$lifespan', status='$status'
                WHERE id='$id'";
    } else {
        // INSERT New
        if (empty($id)) {
            // Generate a random ID if not provided (fallback)
            $id = uniqid('item_');
        }
        $sql = "INSERT INTO inventory 
                (id, model, name, qty, min_threshold, serial_num, category, price, unit, rack_loc, zone_loc, image, currency, date_added, lifespan, status)
                VALUES 
                ('$id', '$model', '$name', $qty, $min_threshold, '$serial', '$cat', $price, '$unit', '$rack', '$zone', '$image', '$currency', '$dateAdded', '$lifespan', '$status')";
    }

    if ($conn->query($sql)) {
        echo json_encode(["success" => true]);
    } else {
        echo json_encode(["success" => false, "error" => $conn->error]);
    }
}
?>