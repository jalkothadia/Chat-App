const nodemailer = require("nodemailer");
const crypto = require("crypto")

const transpoter = nodemailer.createTransport({
    host : process.env.SMTP_HOST,
    port : Number(process.env.SMTP_PORT),
    secure : process.env.SMTP_SECURE === "true",

    auth:{
        user : process.env.SMTP_USER,
        pass : process.env.SMTP_PASSWORD
    }
});

function generateOTP(){
    return crypto.randomInt(100000,1000000).toString();
}

async function sendOTP(email, otp) {
    await transpoter.sendMail({
        from: process.env.SMTP_FROM,
        to: email,
        subject: "ChatApp - Email Verification",
        text : `Your Chat-App OTP is ${otp}`
    });
}

module.exports = {
    generateOTP,
    sendOTP
}