const puppeteer = require("puppeteer");
const fs = require("fs");
const readline = require("readline");
const { spawnSync } = require("child_process");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

// Ask for ID type first
rl.question("Enter ID type (0 = Cédula Identidad, 2 = Jurídica, 7 = Extranjero): ", (idType) => {
    // Validate input
    if (!["0", "2", "7"].includes(idType)) {
        console.error("❌ Invalid ID type. Must be 0, 2, or 7.");
        rl.close();
        return;
    }

    // Ask for ID number
    rl.question("Enter the ID number (e.g. 304630092): ", async (idNumber) => {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        let success = false;
        let attempts = 0;

        while (!success && attempts < 3) {
            attempts++;
            console.log(`\n🔁 Attempt ${attempts}...`);

            await page.goto("https://sfa.ccss.sa.cr/moroso/consultarMorosidad.do", {
                waitUntil: "networkidle2",
            });

            // Select ID type and enter number
            await page.waitForSelector("#tipPatrono");
            await page.select("#tipPatrono", idType);

            await page.waitForSelector("#numPatrono");
            await page.type("#numPatrono", idNumber);

            // Capture CAPTCHA
            const captchaElement = await page.$("#imgCaptchaN");
            if (!captchaElement) {
                console.error("❌ CAPTCHA image not found. Skipping attempt.");
                continue;
            }

            await captchaElement.screenshot({ path: "captcha.png" });

            console.log("🧠 Processing CAPTCHA...");
            const result = spawnSync("python3", ["ocr_solver.py", "captcha.png"], {
                encoding: "utf-8",
                maxBuffer: 10 * 1024 * 1024,
            });

            if (result.error) {
                console.error("⚠️ OCR process failed:", result.error);
                process.exit(1);
            }

            let captchaText = result.stdout.trim();
            console.log("CAPTCHA read as:", captchaText);

            try {
                await page.waitForSelector('input[name="captchaConsulta"]', { timeout: 5000 });
                await page.type('input[name="captchaConsulta"]', captchaText);
            } catch (e) {
                console.error("❌ CAPTCHA input not found. Skipping attempt.");
                continue;
            }

            await Promise.all([
                page.click("#btnConsultaMorosidad"),
                page.waitForNavigation({ waitUntil: "networkidle2" }),
            ]);

            const content = await page.content();
            if (!content.includes("La verificación de caracteres no es correcta")) {
                success = true;
                console.log("\n✅ CAPTCHA correct!");
                const resultText = await page.evaluate(() => document.body.innerText);
                console.log("\n--- Result ---\n");
                console.log(resultText);
            } else {
                console.log("❌ CAPTCHA was incorrect. Retrying...");
            }
        }

        if (!success) {
            console.log("❌ Failed to submit the form after 3 attempts.");
        }

        await browser.close();
        rl.close();
    });
});
