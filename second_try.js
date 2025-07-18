const puppeteer = require("puppeteer");
const fs = require("fs");
const readline = require("readline");
const { spawnSync } = require("child_process");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const ask = (question) =>
    new Promise((resolve) => rl.question(question, resolve));

(async () => {
    console.log("Seleccione el tipo de identificación:");
    console.log("0 - CÉDULA DE IDENTIDAD EN REGISTRO CIVIL");
    console.log("1 - CÉDULA JURÍDICA");
    console.log("2 - EXTRANJERO CON IDENTIFICACIÓN CCSS");

    const tipoId = await ask("Digite 0, 1 o 2 según el tipo de identificación: ");
    const idNumber = await ask("Digite el número de identificación: ");

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    let success = false;
    let attempts = 0;

    while (!success && attempts < 3) {
        attempts++;
        console.log(`\n🔁 Intento ${attempts}...`);

        await page.goto("https://sfa.ccss.sa.cr/moroso/consultarMorosidad.do", {
            waitUntil: "networkidle2",
        });

        await page.select("#tipPatrono", tipoId);
        await page.type("#numPatrono", idNumber);

        const captchaElement = await page.$("#imgCaptchaN");
        await captchaElement.screenshot({ path: "captcha.png" });

        console.log("🧠 Procesando CAPTCHA...");
        const result = spawnSync("python3", ["ocr_solver.py", "captcha.png"], {
            encoding: "utf-8",
            maxBuffer: 10 * 1024 * 1024,
        });

        if (result.error) {
            console.error("⚠️ Error ejecutando OCR:", result.error);
            process.exit(1);
        }

        let captchaText = result.stdout.trim();
        console.log("CAPTCHA leído como:", captchaText);

        try {
            await page.waitForSelector('input[name="captchaConsulta"]', {
                timeout: 5000,
            });
            await page.type('input[name="captchaConsulta"]', captchaText);
        } catch (e) {
            console.error("❌ No se encontró el campo del CAPTCHA. Saltando intento.");
            continue;
        }

        await page.click("#btnConsultaMorosidad");

        // Espera de 2 segundos para que cargue la respuesta
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const resultText = await page.evaluate(() => document.body.innerText);

        const hasCaptchaError = resultText.includes("Captcha requerido") ||
            resultText.includes("verificación de caracteres no es correcta") ||
            resultText.includes("Debe corregir el siguiente error");

        if (hasCaptchaError) {
            console.log("❌ CAPTCHA incorrecto o faltante. Reintentando...");
            continue;
        }

        console.log("\n✅ Resultado obtenido:\n");
        console.log(resultText);
        success = true;
    }

    if (!success) {
        console.log("❌ Falló el envío del formulario tras 3 intentos.");
    }

    await browser.close();
    rl.close();
})();
