<?php
// Proxy PHP para redirecionar chamadas do dashboard para a API da Kommo.
// Necessário porque o browser bloqueia chamadas diretas por CORS.

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Authorization, Content-Type, Accept");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");

// Responde a pre-flight CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Captura o header Authorization (compatível com mod_php e PHP-CGI)
$authHeader = '';
if (function_exists('apache_request_headers')) {
    $headers = apache_request_headers();
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
}
if (!$authHeader && isset($_SERVER['HTTP_AUTHORIZATION'])) {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
}
if (!$authHeader && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
    $authHeader = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
}

// Monta a URL de destino na API da Kommo
$path = $_GET['kommo_path'] ?? '';
unset($_GET['kommo_path']);
$queryString = http_build_query($_GET);

$url = "https://nutrijosiaspapa.kommo.com/api/v4/" . ltrim($path, '/');
if ($queryString) {
    $url .= "?" . $queryString;
}

// Executa a requisição via cURL
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => [
        "Authorization: " . $authHeader,
        "Content-Type: application/json",
        "Accept: application/json",
    ],
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT        => 30,
]);

$response = curl_exec($ch);
$httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

header("Content-Type: application/json");

if ($curlError) {
    http_response_code(500);
    echo json_encode(["error" => "Erro de conexão: " . $curlError]);
    exit;
}

http_response_code($httpCode ?: 200);
echo $response ?: '{}';
