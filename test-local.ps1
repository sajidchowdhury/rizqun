$ErrorActionPreference = "Stop"

$BASE = "http://localhost:3000"
$EMAIL = "admin@rizqun.com"
$PASSWORD = "ChangeMeInProduction123!"

$passed = 0
$failed = 0

function Test-Step {
    param(
        [string]$Name,
        [scriptblock]$Action
    )

    Write-Host ""
    Write-Host "==================================================" -ForegroundColor DarkGray
    Write-Host $Name
    Write-Host "==================================================" -ForegroundColor DarkGray

    try {
        $result = & $Action

        Write-Host "PASS" -ForegroundColor Green
        $script:passed++

        if ($null -ne $result) {
            $result | ConvertTo-Json -Depth 10
        }

        return $result
    }
    catch {
        Write-Host "FAIL" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red

        if ($_.ErrorDetails.Message) {
            Write-Host $_.ErrorDetails.Message -ForegroundColor Red
        }

        $script:failed++
        return $null
    }
}

# --------------------------------------------------
# 1. HEALTH
# --------------------------------------------------

$health = Test-Step "1. Health check" {
    Invoke-RestMethod `
        -Uri "$BASE/health" `
        -Method GET
}

# --------------------------------------------------
# 2. LOGIN
# --------------------------------------------------

$login = Test-Step "2. Admin login" {
    $body = @{
        email = $EMAIL
        password = $PASSWORD
    } | ConvertTo-Json

    Invoke-RestMethod `
        -Uri "$BASE/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body
}

if (-not $login.data.accessToken) {
    throw "Login succeeded but no access token was returned."
}

$token = $login.data.accessToken

$headers = @{
    Authorization = "Bearer $token"
}

Write-Host ""
Write-Host "JWT token received successfully." -ForegroundColor Green

# --------------------------------------------------
# 3. PRODUCT SEARCH
# --------------------------------------------------

$search = Test-Step "3. Product search: rice" {
    Invoke-RestMethod `
        -Uri "$BASE/products/search?q=rice" `
        -Method GET `
        -Headers $headers
}

# --------------------------------------------------
# 4. VENDORS
# --------------------------------------------------

$vendors = Test-Step "4. List vendors" {
    Invoke-RestMethod `
        -Uri "$BASE/vendors" `
        -Method GET `
        -Headers $headers
}

# --------------------------------------------------
# 5. PRODUCTS
# --------------------------------------------------

$products = Test-Step "5. List products" {
    Invoke-RestMethod `
        -Uri "$BASE/products" `
        -Method GET `
        -Headers $headers
}

# --------------------------------------------------
# 6. DASHBOARD SUMMARY
# --------------------------------------------------

$dashboard = Test-Step "6. Dashboard summary" {
    Invoke-RestMethod `
        -Uri "$BASE/dashboard/summary" `
        -Method GET `
        -Headers $headers
}

# --------------------------------------------------
# 7. DASHBOARD CHARTS
# --------------------------------------------------

$ordersPerDay = Test-Step "7. Dashboard orders per day" {
    Invoke-RestMethod `
        -Uri "$BASE/dashboard/orders-per-day?days=30" `
        -Method GET `
        -Headers $headers
}

$avgTimePerDay = Test-Step "7b. Dashboard avg time per day" {
    Invoke-RestMethod `
        -Uri "$BASE/dashboard/avg-time-per-day?days=30" `
        -Method GET `
        -Headers $headers
}

$categoryBreakdown = Test-Step "7c. Dashboard category breakdown" {
    Invoke-RestMethod `
        -Uri "$BASE/dashboard/category-breakdown?month=2026-08" `
        -Method GET `
        -Headers $headers
}
# --------------------------------------------------
# 8. CREATE ORDER
# --------------------------------------------------

$orderBody = @{
    customerName = "Local Test Customer"
    customerPhone = "01712345678"
    items = @(
        @{
            productId = 1
            qty = 2
        }
    )
} | ConvertTo-Json -Depth 10

$order = Test-Step "8. Create order" {
    Invoke-RestMethod `
        -Uri "$BASE/orders" `
        -Method POST `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $orderBody
}

# Try to identify order ID from common response structures
$orderId = $null

if ($order.data.id) {
    $orderId = $order.data.id
}
elseif ($order.data.order.id) {
    $orderId = $order.data.order.id
}
elseif ($order.id) {
    $orderId = $order.id
}

if ($orderId) {
    Write-Host ""
    Write-Host "Created order ID: $orderId" -ForegroundColor Green
}
else {
    Write-Host ""
    Write-Host "Could not automatically determine order ID." -ForegroundColor Yellow
}

# --------------------------------------------------
# 9. LIST ORDERS
# --------------------------------------------------

$orders = Test-Step "9. List orders" {
    Invoke-RestMethod `
        -Uri "$BASE/orders" `
        -Method GET `
        -Headers $headers
}

# --------------------------------------------------
# 10. ORDER STATUS
# --------------------------------------------------

if ($orderId) {

    $statusBody = @{
        status = "waiting_vendor"
    } | ConvertTo-Json

    $status = Test-Step "10. Update order status" {

        Invoke-RestMethod `
            -Uri "$BASE/orders/$orderId/status" `
            -Method PATCH `
            -Headers $headers `
            -ContentType "application/json" `
            -Body $statusBody
    }

}
else {
    Write-Host ""
    Write-Host "10. Order status test skipped because order ID was unavailable." -ForegroundColor Yellow
}

# --------------------------------------------------
# 11. PENDING ORDERS
# --------------------------------------------------

$pending = Test-Step "11. Pending orders" {
    Invoke-RestMethod `
        -Uri "$BASE/orders/pending" `
        -Method GET `
        -Headers $headers
}

# --------------------------------------------------
# 12. DONE ORDERS
# --------------------------------------------------

$done = Test-Step "12. Done orders" {
    Invoke-RestMethod `
        -Uri "$BASE/orders/done" `
        -Method GET `
        -Headers $headers
}

# --------------------------------------------------
# 13. USERS
# --------------------------------------------------

$users = Test-Step "13. Admin users" {
    Invoke-RestMethod `
        -Uri "$BASE/users" `
        -Method GET `
        -Headers $headers
}

# --------------------------------------------------
# 14. CATEGORIES
# --------------------------------------------------

$categories = Test-Step "14. Categories" {
    Invoke-RestMethod `
        -Uri "$BASE/categories" `
        -Method GET `
        -Headers $headers
}

# --------------------------------------------------
# FINAL SUMMARY
# --------------------------------------------------

Write-Host ""
Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "              RIZQUN LOCAL TEST SUMMARY           " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor Red

Write-Host ""

if ($failed -eq 0) {
    Write-Host "ALL TESTS PASSED" -ForegroundColor Green
}
else {
    Write-Host "SOME TESTS FAILED - REVIEW THE OUTPUT ABOVE" -ForegroundColor Yellow
}

Write-Host ""