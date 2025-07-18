const puppeteer = require("puppeteer");
const fs = require("fs");
const readline = require("readline");
const { spawnSync } = require("child_process");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

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

        // Fill in ID and type
        await page.waitForSelector("#tipPatrono");
        await page.select("#tipPatrono", "0");

        await page.waitForSelector("#numPatrono");
        await page.type("#numPatrono", idNumber);

        // Capture CAPTCHA image from DOM (don't leave page)
        const captchaElement = await page.$("#imgCaptchaN");
        await captchaElement.screenshot({ path: "captcha.png" });

        // Call Python OCR
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

        // Fill in CAPTCHA
        try {
            await page.waitForSelector('input[name="captchaConsulta"]', { timeout: 5000 });
            await page.type('input[name="captchaConsulta"]', captchaText);
        } catch (e) {
            console.error("❌ CAPTCHA input not found. Skipping attempt.");
            continue;
        }

        // Submit form
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
