// ================== Akola Police Cybercell WhatsApp Chatbot ==================
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const axios = require("axios");
const { UserSession, Conversation } = require("./models");

const router = express.Router();
router.use(express.json());

// ================== Database Schemas ==================
const userSessionSchema = new mongoose.Schema({
  phoneNumber: String,
  language: String,
  currentMenu: String,
  previousMenu: String,
  lastInteraction: { type: Date, default: Date.now },
  userName: String,
  awaitingInput: String,
});

const conversationSchema = new mongoose.Schema({
  phoneNumber: String,
  userName: String,
  message: String,
  messageType: String,
  timestamp: { type: Date, default: Date.now },
  language: String,
});

// ================== WhatsApp Cloud API Setup ==================
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "CybercellVerify";

if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
  console.error("❌ ERROR: WHATSAPP_TOKEN or PHONE_NUMBER_ID missing in .env");
  process.exit(1);
}

// ================== Utility Functions ==================
async function logConversation(
  phoneNumber,
  message,
  messageType,
  language = "en",
  userName = ""
) {
  try {
    await Conversation.create({
      phoneNumber,
      userName,
      message,
      messageType,
      language,
    });
  } catch (err) {
    console.error("Error logging conversation:", err);
  }
}

async function sendTextMessage(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        text: { body: text },
      },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
    );
    const session = await UserSession.findOne({ phoneNumber: to });
    await logConversation(
      to,
      text,
      "bot",
      session?.language || "en",
      session?.userName || ""
    );
    console.log(`✅ Sent text message to ${to}`);
  } catch (err) {
    console.error("❌ Error sending text:", err.response?.data || err.message);
  }
}

async function sendQuickReply(to, body, buttons) {
  try {
    const formattedButtons = buttons.slice(0, 3).map((button, index) => ({
      type: "reply",
      reply: {
        id: button.id || `btn_${Date.now()}_${index}`,
        title:
          button.title.length > 20
            ? button.title.substring(0, 20)
            : button.title,
      },
    }));

    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: body },
          action: { buttons: formattedButtons },
        },
      },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
    );
    const session = await UserSession.findOne({ phoneNumber: to });
    await logConversation(
      to,
      `${body}\nButtons: ${buttons.map((b) => b.title).join(", ")}`,
      "bot",
      session?.language || "en",
      session?.userName || ""
    );
    console.log(`✅ Sent quick reply to ${to}`);
  } catch (err) {
    console.error(
      "❌ Error sending quick reply:",
      err.response?.data || err.message
    );
  }
}

async function sendListMessage(to, header, body, buttonText, sections) {
  try {
    const safeButtonText = (buttonText || "Choose").slice(0, 20) || "Choose";

    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          header: { type: "text", text: header },
          body: { text: body },
          footer: { text: "Akola Police Cybercell" },
          action: {
            button: safeButtonText,
            sections,
          },
        },
      },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
    );
    const session = await UserSession.findOne({ phoneNumber: to });
    const listOptions = sections
      .map((s) => s.rows?.map((r) => r.title).join(", "))
      .join(" | ");
    await logConversation(
      to,
      `${header}: ${body}\nOptions: ${listOptions}`,
      "bot",
      session?.language || "en",
      session?.userName || ""
    );
    console.log(`✅ Sent list message to ${to}`);
  } catch (err) {
    console.error(
      "❌ Error sending list message:",
      err.response?.data || err.message
    );
  }
}

async function sendInfoWithButtons(to, infoBody, lang) {
  const t = textContent[lang];
  const navButtons = [
    { id: "back_to_previous", title: t.navigation.previous },
    { id: "back_to_main", title: t.navigation.main },
  ];
  await sendQuickReply(to, infoBody, navButtons);
}

// ================== Text & Menu Content ==================
const textContent = {
  en: {
    navigation: {
      previous: "⬅️ Previous Menu",
      main: "🏠 Main Menu",
    },
    welcome:
      "*👮‍♂ अकोला पोलीस*\n━━━━━━━━━\n*अकोला पोलीस अधिकृत WhatsApp ChatBot मध्ये आपले स्वागत आहे.*\n\n━━━━━━━━━\n*कृपया आपली प्राधान्य भाषा निवडा.*",
    language_buttons: [
      { id: "lang_en", title: "English" },
      { id: "lang_mr", title: "मराठी" },
    ],
    mainMenu: {
      header: "👮‍♂ Akola Police",
      body: "\n━━━━━━━━━\nWe are committed to serving every citizen with honesty, transparency, and responsibility.\nYour safety, trust, and peace of mind are our top priorities.\n\nThrough *Akola Police*, you can access essential police services, register complaints, and get verified information anytime, anywhere.\n\nLet's work together to build a safe, fearless, and citizen-friendly police force.\n\n🌐 https://www.akolapolice.gov.in",

      buttonText: "🔽 Select Service", // <= 20
      sections: [
        {
          title: "👮 Citizen Services",
          rows: [
            {
              id: "our_services",
              title: "🛂 Services",
              description: "Traffic, RTS (Total 17/17), Whatsapp Channel.",
            },
            {
              id: "event_intimation",
              title: "📢 Event Intimation",
              description: "Updates on major events and initiatives.",
            },
            {
              id: "cyber_issues",
              title: "💻 Cyber Issues",
              description: "Report cybercrime, fraud, hacked accounts.",
            },
            {
              id: "emergency_contacts",
              title: "🚨 Emergency",
              description: "Helpline numbers for urgent help.",
            },
          ],
        },
        {
          title: "ℹ️ Info & Track",
          rows: [
            {
              id: "complaint_register",
              title: "📝 Complaint",
              description: "File a new complaint via Seva.",
            },
            {
              id: "track_complaint",
              title: "🔎 Track Complaint",
              description: "Check the status of a filed complaint.",
            },
            {
              id: "know_akola_police",
              title: "🏢 About Akola Police",
              description: "Stations, Branches, Officers info.",
            },
          ],
        },
        {
          title: "🌐 Citizen Corner",
          rows: [
            {
              id: "public_awareness",
              title: "📢 Awareness",
              description: "Information and safety tips.",
            },
            {
              id: "citizen_responsibility",
              title: "🤝 Citizen Duties",
              description: "Learn about your role as a citizen.",
            },
          ],
        },
      ],
    },

    ourServicesMenu: {
      header: "🛂 Services",
      body: "Choose from our service options.",
      buttonText: "📋 View Services",
      sections: [
        {
          title: "Available Services",
          rows: [
            {
              id: "major_services",
              title: "⭐ RTS Services",
              description: "District Branch & Other Branches",
            },
            {
              id: "passport_info",
              title: "🛂 Passport",
              description: "Passport-related services.",
            },
            {
              id: "police_verification_info",
              title: "📑 Police Verification",
              description: "Verification related services.",
            },
            {
              id: "traffic_service_info",
              title: "🚦 Traffic Services",
              description: "Traffic and challan related info.",
            },
            {
              id: "whatsapp_channel_info",
              title: "📲 WhatsApp Channel",
              description: "Get updates on our official channel.",
            },
          ],
        },
      ],
    },

    majorServicesMenu: {
      header: "⭐ Major RTS Services",
      body: "Please select a service department.",
      buttonText: "📋 View Departments",
      sections: [
        {
          title: "Service Departments",
          rows: [
            {
              id: "district_special_branch",
              title: "🏢 District Branch",
              description: "Services under District Special Branch.",
            },
            {
              id: "other_branches",
              title: "🏛️ Other Branches",
              description: "Services under Other Branches.",
            },
          ],
        },
      ],
    },

    districtSpecialBranchMenu: {
      header: "🏢 District Special Branch",
      body: "Please select a service.",
      buttonText: "📋 View Services",
      sections: [
        {
          title: "District Branch Services",
          rows: [
            {
              id: "dsb_service_1",
              title: "🌍 Foreign NOC",
              description: "NOC for foreign nationals.",
            },
            {
              id: "dsb_service_2",
              title: "🛂 Police Clearance",
              description: "Police clearance certificate (PCC).",
            },
            {
              id: "dsb_service_3",
              title: "📑 Proposals to GOI",
              description: "Forwarding proposals to Govt of India.",
            },
            {
              id: "dsb_service_4",
              title: "🕒 Stay Extension",
              description: "Extension of stay for foreigners.",
            },
            {
              id: "dsb_service_5",
              title: "🔙 Return NOC",
              description: "NOC for citizens returning to India.",
            },
            {
              id: "dsb_service_6",
              title: "💼 Job NOC",
              description: "Employment-related NOC.",
            },
            {
              id: "dsb_service_7",
              title: "✈️ Travel PCC",
              description: "Police clearance for travel abroad.",
            },
            {
              id: "dsb_service_8",
              title: "🌏 Tibetan NOC",
              description: "NOC for Tibetan citizens.",
            },
          ],
        },
      ],
    },

    otherBranchesMenu: {
      header: "🏛️ Other Branches",
      body: "Please select a service.",
      buttonText: "📋 View Services",
      sections: [
        {
          title: "Other Branch Services",
          rows: [
            {
              id: "ob_service_1",
              title: "🎭 Artist Permit",
              description: "Permission for foreign artists.",
            },
            {
              id: "ob_service_2",
              title: "📜 Document Attest",
              description: "Attestation of official documents.",
            },
            {
              id: "ob_service_3",
              title: "📄 FIR Copy",
              description: "Copy of First Information Report.",
            },
            {
              id: "ob_service_4",
              title: "🔊 Loudspeaker Permit",
              description: "Permission for using loudspeakers.",
            },
            {
              id: "ob_service_5",
              title: "🎶 Event NOC",
              description: "NOC for entertainment programs.",
            },
            {
              id: "ob_service_6",
              title: "📢 Meeting Permit",
              description: "Permission for meetings & parades.",
            },
            {
              id: "ob_service_7",
              title: "🏪 Business NOC",
              description: "NOC for pumps, hotels, bars, etc.",
            },
            {
              id: "ob_service_8",
              title: "🔫 Firearm NOC",
              description: "NOC for firearm license.",
            },
          ],
        },
      ],
    },

    eventIntimationMenu: {
      header: "📢 Event Intimation",
      body: "Select an event for details.",
      buttonText: "📋 View Events",
      sections: [
        {
          title: "🌟 Major Events",
          rows: [
            {
              id: "event_navratri",
              title: "🗳️Election Awareness",
              description: "festival of democracy peacefully and responsibly!",
            },
            {
              id: "event_prahar",
              title: "🚔 Operation Prahar",
              description: "Anti-crime awareness campaign.",
            },
            {
              id: "event_udan",
              title: "✈️ Mission Udan",
              description: "Youth safety and awareness drive.",
            },
            {
              id: "event_raksha_qr",
              title: "🛡️ Raksha",
              description: "Raksha safety initiative.",
            },
          ],
        },
      ],
    },

    cyberIssuesMenu: {
      header: "💻 Cyber Issues",
      body: "Choose the issue you are facing.",
      buttonText: "⚡ Select Issue", // <= 20
      sections: [
        {
          title: "🛡️ Cyber Help",
          rows: [
            {
              id: "victim_of_cybercrime",
              title: "😞 Cybercrime Victim",
              description: "Report if you are a victim.",
            },
            {
              id: "lost_stolen_mobile",
              title: "📱 Lost Mobile",
              description: "Report and block your lost mobile.",
            },
            {
              id: "social_media_hacked",
              title: "🔐 Hacked Account",
              description: "Get help for hacked accounts.",
            },
            {
              id: "online_financial_fraud",
              title: "💰 Online Fraud",
              description: "Information on financial scams.",
            },
            {
              id: "cyber_volunteer",
              title: "🤝 Cyber Volunteer",
              description: "Join the I4C program by MHA.",
            },
            {
              id: "bank_account_hold",
              title: "🏦 Bank Hold",
              description: "Steps to take if your account is held.",
            },
            {
              id: "sanchar_saathi",
              title: "📞 Sanchar Saathi",
              description: "Know mobile connections in your name.",
            },
          ],
        },
      ],
    },

    knowAkolaPoliceMenu: {
      header: "🏢 About Akola Police",
      body: "Select an option to get more information.",
      buttonText: "📖 View Info",
      sections: [
        {
          title: "📂 Departments Info",
          rows: [
            {
              id: "police_stations_branches",
              title: "🚔 Stations & Branches",
              description: "Find details of stations and branches.",
            },
            {
              id: "senior_police_officers",
              title: "👮 Senior Officers",
              description: "List of senior officers.",
            },
            {
              id: "history_akola_police",
              title: "📜 History",
              description: "Learn the history.",
            },
          ],
        },
      ],
    },

    policeStationsBranchesMenu: {
      header: "🚔 Stations & Branches",
      body: "Select a division to view stations or select a branch.",
      buttonText: "📋 Select Option",
      sections: [
        {
          title: "🏢 Police Divisions",
          rows: [
            { id: "city_division", title: "🏙️ City Division" },
            { id: "akot_division", title: "🌾 Akot Division" },
            { id: "balapur_division", title: "🏞️ Balapur Division" },
            { id: "murtijapur_division", title: "🚉 Murtizapur Div" },
          ],
        },
        {
          title: "🛡️ Police Branches",
          rows: [
            { id: "branch_control_room", title: "🎛️ Control Room" },
            { id: "branch_lcb", title: "🔎 Local Crime Branch" },
            { id: "branch_cyber_cell", title: "💻 Cyber Crime Cell" },
            { id: "branch_bharosa_cell", title: "🤝 Bharosa Cell" },
            { id: "branch_traffic", title: "🚦 Traffic Branch" },
            { id: "branch_dsb", title: "📂 District Special" },
          ],
        },
      ],
    },

    cityDivisionStations: {
      header: "City Division Stations",
      body: "Select a station for more details.",
      buttonText: "🏙️ City",
      sections: [
        {
          title: "Stations",
          rows: [
            { id: "station_akot_file", title: "📄 Akot File" },
            { id: "station_ramdaspeth", title: "🛣️ Ramdaspeth" },
            { id: "station_city_kotwali", title: "🏢 City Kotwali" },
            { id: "station_old_city", title: "🏛️ Old City" },
            { id: "station_khadan", title: "⛏️ Khadan" },
            { id: "station_civil_line", title: "🏤 Civil Line" },
            { id: "station_midc", title: "🏭 M.I.D.C" },
            { id: "station_dabki_road", title: "🛤️ Dabki Rd" },
          ],
        },
      ],
    },

    akotDivisionStations: {
      header: "Akot Division Stations",
      body: "Select a station for more details.",
      buttonText: "🌇 Akot",
      sections: [
        {
          title: "Stations",
          rows: [
            { id: "station_akot_city", title: "🏙️ Akot City" },
            { id: "station_akot_rural", title: "🌾 Akot Rural" },
            { id: "station_dahihanda", title: "🏡 Dahihanda" },
            { id: "station_telhara", title: "🌳 Telhara" },
            { id: "station_hiwarkhed", title: "🌿 Hiwarkhed" },
          ],
        },
      ],
    },

    balapurDivisionStations: {
      header: "Balapur Division Stations",
      body: "Select a station for more details.",
      buttonText: "🏡 Balapur",
      sections: [
        {
          title: "Stations",
          rows: [
            { id: "station_balapur", title: "🏘️ Balapur" },
            { id: "station_ural", title: "🌾 Ural" },
            { id: "station_channi", title: "🏠 Channi" },
            { id: "station_patur", title: "🌳 Patur" },
          ],
        },
      ],
    },

    murtijapurDivisionStations: {
      header: "Murtizapur Division Stations",
      body: "Select a station for more details.",
      buttonText: "🚉 Murtizapur",
      sections: [
        {
          title: "Stations",
          rows: [
            { id: "station_murtijapur_city", title: "🏙️ Murtizapur City" },
            { id: "station_murtijapur_rural", title: "🌾 Murtizapur Rural" },
            { id: "station_mana", title: "🏡 Mana" },
            { id: "station_barshitakli", title: "🌳 Barshitakli" },
            { id: "station_pinjar", title: "🌿 Pinjar" },
            { id: "station_borgaon_manju", title: "🏠 Borgaon Manju" },
          ],
        },
      ],
    },

    infoTexts: {
      // Our Services
      passport_info:
        "🛂 *PASSPORT SERVICES* \n\n🔹 Apply for a new passport\n🔹 Track passport application status\n🔹 Required documents for passport\n\n🌐 Visit the official website: https://www.passportindia.gov.in",
      police_verification_info:
        "📄 *POLICE VERIFICATION* \n\n🔹 Apply for police clearance certificate\n🔹 Track verification request\n🔹 Required documents for verification\n\n🌐 Visit the official website: https://pcs.mahaonline.gov.in/Forms/Home.aspx",
      traffic_service_info:
        "🚦 *TRAFFIC SERVICES* \n\n🔹 Check and pay traffic fines\n🔹 Report traffic violations\n🔹 Learn about road safety Rules\n\n🌐 Visit the official website: https://mahatrafficechallan.gov.in/payechallan/PaymentService.htm",
      whatsapp_channel_info:
        "*🛂 WhatsApp Channel* \n\n🚨 Akola Police🚔\nIn the service of the citizens... 🗣 has brought a new digital medium\n\n🚔 Akola Police WhatsApp Channel📡\n\n📡 WhatsApp Channel link👇🏻\nhttps://whatsapp.com/channel/0029Vb5zl1ELo4hg5l5kgd2D",

      // Cyber Issues
      victim_of_cybercrime:
        "💰 *VICTIM OF CYBER CRIME*\n\nTake Action Now! 💻\nIf you've been targeted by cybercriminals, act immediately to minimize damage and recover your losses.\n\n📞 Essential Helplines:\n🌐 National Cyber Crime Reporting Portal: 🔗 cybercrime.gov.in (File complaints online)\n📞 Cyber Crime Helpline Numbers: 1930\n\n⏳ Time is crucial! The faster you report, the higher the chances of preventing further loss and tracking cybercriminals.\n\n🛡🚔 Visit Your Nearest Police Station for immediate help.",

      lost_stolen_mobile:
        "📱 *Lost or Stolen Mobile Reporting Guide* 📱\n\n• Lost Your Mobile? Take Action Now! 💻🔍\nIf your mobile phone is lost or stolen, act immediately to protect your data and prevent misuse.\n\n- Report & Block Your Lost Mobile Online:\n- CEIR Portal - File a Complaint ( https://www.ceir.gov.in/Request/CeirUserBlockRequestDirect.jsp )\n\nFor More Updates :- https://x.com/AkolaPolice/status/1901493532344610864",

      social_media_hacked:
        "🚔 SOCIAL MEDIA ACCOUNT HACKED? ACT NOW! 🔐📱*\n\nIf your social media account has been hacked or compromised, follow these steps immediately:\n\n🔒 Secure Your Account:\n- Change Your Password to a strong, unique one.\n- Enable Two-Factor Authentication (2FA) for extra security.\n- Check Connected Apps and revoke access to suspicious ones.\n\n📩 Report to the Platform:\n- Report the issue to the platform (Facebook, Instagram, WhatsApp, etc.) via their support center.\n\n🌐 More help: https://cyberpolicediary.netlify.app/",

      online_financial_fraud:
        "💳 *Beware of Online Financial Fraud! 💳🔍*\n\nCyber fraud can cause significant financial loss. Stay alert and protect yourself from scams.\n\n⚠ Common Types of Online Fraud:\n- 🆔 Identity Theft\n- 💳 Credit Card Fraud\n- 📉 Investment Scams\n- 📦 Online Shopping Scams\n- Digital Arrest Scam\n\n🛡 How to Stay Safe:\n- Never share personal details.\n- Use strong passwords and 2FA.\n- Keep software updated.\n- Monitor bank statements regularly.\n\n🚔 If You Suspect Fraud:\n- 📞 Report to your bank immediately.\n- 📌 File a complaint at National Cyber Crime Portal (cybercrime.gov.in).",

      cyber_volunteer:
        'The "Cyber Volunteer Program" has been launched by I4C under the Ministry of Home Affairs (MHA) 🚔\n\n🔹 Purpose: To create a safe digital environment by involving citizens.\n\nVolunteer Roles:\n- Unlawful Content Flagger\n- Cyber Awareness Promoter\n- Cyber Expert\n\nRegistration Process:\n- Visit the official portal: https://cybercrime.gov.in/Webform/CyberVolunteerinstruction.aspx\n- Create a profile and upload required documents\n- Select a role and submit the application ✅\n\n🌐 Video Guidance: https://youtu.be/nxCJv6ywO6Y?feature=shared\n\nContact:\n📞 0724-2445319 | 📱 WhatsApp: 8275599668\nTwitter (X): https://x.com/Cyberdost',

      bank_account_hold:
        "🏦 *Bank Account Has Been Put On Hold*\n\nIf you have identified suspicious activity in your bank account, please contact the Maharashtra Cyber Helpline.\n\n📧 Email ID: mhcyber.helpline1930@mahapolice.gov.in\n📞 Contact number - 07242445319 / 8657013913",

      sanchar_saathi:
        "*Sanchar Saathi*\n\n📱🔍 Want to know how many SIM cards are issued in your name?\nUse Sanchar Saathi to detect unauthorized connections 🚫 and register complaints.\n\n📥 Download the Sanchar Saathi App today:\n👉 Android: https://play.google.com/store/apps/details?id=com.dot.app.sancharsaathi\n👉 iOS: https://apps.apple.com/in/app/sanchar-saathi/id6739700695\n\n🌐 Website: https://sancharsaathi.gov.in",

      // Emergency & Info
      emergency_contacts:
        "🚨 *Emergency Contacts!* 🦺\n\n📞 Dial *112* in any Emergency 🚔\n\n📌 *Essential Helpline Numbers:*\n☎️ Control Room: 0724-2435500\n📱 Control Room WhatsApp: 8805461100\n👩‍✈️ Damini Pathak (Women’s Safety): 7447410015\n💻 Cyber Helpline: 1930\n\n🌐 For all important contacts, visit:\n akolapolice.gov.in/imp-contacts\n\n⚠ Stay Safe, Stay Alert!",

      complaint_register:
        "✍️ *File a Complaint*\n\n🕵️‍♂️ Click the link below and fill out the form to submit your complaint online.\n\n🌐 https://www.sevapolice.co.in/AkolaDist/user/chatbot_compliant_entry_eng.php\n\n📄 Your cooperation helps us maintain safety and justice.",

      track_complaint:
        "👮‍♂ Hello!\n\nOnce your complaint registered through the chatbot is verified at the police station, you can track it here.\n\n📱 Please send your *10-digit mobile number* to know the status of your complaint. ✅",
      track_complaint_invalid:
        "❌ That doesn't look like a valid phone number. Please try again.",
      track_complaint_success: "🔗 Here is your complaint tracking link:",

      public_awareness:
        "📞 *PUBLIC AWARENESS*\n\n🔹 Your Safety, Our Priority! 🔹\n\nVisit our website for breakthroughs and good work: https://akolapolice.gov.in/good-work \n\n📌 Road Safety First! 🚦🚗\n- Always wear a helmet.\n- Adhere to traffic signals.\n- Avoid rash driving.\n\n📌 Cyber Safety Matters! 💻🔒\n- Never share OTPs or passwords.\n- Be cautious of online fraudsters.\n- Verify links before clicking.\n\nFor more updates, follow us on X: https://x.com/cybercellakola and visit https://www.akolapolice.gov.in/citizen-alertwall",

      citizen_responsibility:
        "🌟 As responsible citizens of Akola, it is our duty to maintain the safety, harmony, and progress of our city.\n\n1. Follow the Law – Obey all traffic, civic, and cyber regulations.\n2. Report Crimes – Inform police about frauds or suspicious activities.\n3. Keep Clean – Maintain cleanliness in public areas and surroundings.\n4. Respect Everyone – Promote peace, avoid hate and misinformation.\n5. Support Safety – Cooperate with police and community efforts.\n6. Use Govt Services – Rely only on verified and official sources.\n7. Stay Prepared – Know emergency numbers and act responsibly.\n\nTogether, let's build a safe, strong, and proud Akola! ",

      senior_police_officers:
        '👮‍♂ Shri. Archit Chandak (IPS)\n- Superintendent of Police\n- ☎ 07242435002 \n\n👮‍♂ Shri. B. Chandrakant Reddy (IPS)\n- Additional Superintendent of Police\n- ☎  8806705480 \n\n👮‍♂ Shri. Nikhil Patil (IPS/ASP)\n- Sub-Divisional Police Officer (Akot Division)\n- ☎ 8888593060 \n\n👮‍♂ Shri. Sudarshan Patil (SDPO)\n- Sub-Divisional Police Officer (City Division)\n- ☎ 9921311858 \n\n👮‍♂ Shri. Gajanan Padghan (SDPO) \n- Sub-Divisional Police Officer (Balapur Division)\n- ☎ 9922918102 \n\n👮‍♀ Smt. Vaishali Mule (SDPO)\n- Sub-Divisional Police Officer (Murtizapur Division)\n- ☎ 8668352969 \n\n💬 "Dedicated to serving and protecting Akola with integrity and commitment."',

      history_akola_police:
        "📜 *History & Structure of Akola Police* 🏛️\n\n⏳ *Historical Background:*\n- Before independence, Akola was under British rule 🇬🇧, and the British police system operated here.\n- After independence 🇮🇳, Akola became part of the Maharashtra Police Force 👮‍♂️.\n- Shri. S. S. Harmansingh (IPS) was the first Superintendent of Police, appointed on *8 August 1947* 🗓️.\n- Since then, 31 Superintendents have served with dedication 👥.\n\n👮‍♂️ *Current Structure:*\n- Present SP: *Shri. Archit Chandak (IPS)* 🏢.\n- Under him: 1 Additional SP, 4 SDPOs 🧑‍✈️, 23 Police Stations 🚓, and several specialized branches 🏢.\n- ⚖️ Functions: Maintain law & order, prevent crime, ensure citizen safety, and promote awareness.\n- 💻 Modern technology aids crime control and transparency.\n\n✨ Akola Police – Always in Service of Citizens. ✨",

      // Generic Station/Branch info text
      station_info:
        "You have selected {NAME}. For INCHARGE details, emergency contact no, helpline, email, and Google Map location, please visit our official website: akolapolice.gov.in",

      // ===== Police Branches =====
      branch_control_room:
        '*AKOLA POLICE CONTROL ROOM*\n\n📞 Emergency Number: 112\n📞 Control Room Helpline: 0724-2435500\n📱 WhatsApp: 88054 61100\n🔹 Twitter (X): https://x.com/akolapolice?lang=en\n🌐 Website: https://www.akolapolice.gov.in/\n\n📍 Location Details:\n🔗 Google Map: https://maps.app.goo.gl/FhmpFbX3G4Vbn75u9\n\n"To protect the good and to destroy evil!",',

      branch_lcb:
        '🔎 *LOCAL CRIME BRANCH (LCB)*\n\n👮‍♂ Incharge: PI Shankar Shelke\n📞 Phone: 9822966007\n📧 Email: lcb.akola@mahapolice.gov.in\n🌐 Website: https://www.akolapolice.gov.in\n\n📍 Location:\n🔗 Google Maps:  https://www.google.com/maps/search/?api=1&query=Local+Crime+Branch+Akola\n\n"Investigating crime with precision."',

      branch_cyber_cell:
        '🔒 *CYBER CELL*\n\n👮‍♂ Incharge: API Manisha Tayade\n📞 Phone: 0724-2445319\n📧 Email: cybercell.akola@mahapolice.gov.in\n🔹 Twitter: https://x.com/cybercellakola?t=m1kUC1GWlQhjV0RXPPRb6w&s=08\n🌐 Website: https://www.akolapolice.gov.in/\n\n📍 Location Details:\n🔗 Google Map: https://www.google.com/maps/search/?api=1&query=Special+Branch+Akola\n\n"To protect the good and to destroy evil!",',

      branch_bharosa_cell:
        '🔒 *BHAROSA CELL*\n\n👮‍♂ Incharge: PI Chandrakala Mesare\n📞 Phone: 9588669579\n📧 Email: mahilakaksha.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/akolapolice?lang=en\n🌐 Website: akolapolice.gov.in\n\n📍 Location Details:\n🔗 Google Map: https://www.google.com/maps/search/?api=1&query=Bharosa+Cell+Akola\n\n"To protect the good and to destroy evil!",',

      branch_traffic:
        '🔒 *TRAFFIC BRANCH*\n\n👮‍♂ Incharge: PI Manoj Bahure\n📞 Phone: 9702966464\n📧 Email: traffic.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/CTB_Akola?t=y8piXG5ZgviSHkNo1SKoGQ&s=09\n🌐 Website: https://www.akolapolice.gov.in/\n\n📍 Location Details:\n🔗 Google Map: https://www.google.com/maps/search/?api=1&query=Traffic+Branch+Akola\n\n"To protect the good and to destroy evil!",',

      branch_dsb:
        '🔒 *DISTRICT SPECIAL BRANCH*\n\n👮‍♂ Incharge: PI Gajanan Dhandar\n📞 Phone: 9823236034\n📧 Email: dsb.pol.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/akolapolice?lang=en\n🌐 Website: https://www.akolapolice.gov.in/\n\n📍 Location Details:\n🔗 Google Map: https://maps.app.goo.gl/FhmpFbX3G4Vbn75u9\n\n"To protect the good and to destroy evil!",',

      // ===== seprate Police Station en =====
      station_akot_file:
        '*AKOT FILE POLICE STATION*\n\n👮‍♂ Incharge: PI Shri. Shaikh Rahim Shaikh Gaffar\n📞 Phone: 8411937110\n📧 Email: ps.akotfile.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/psakotfile\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a57af672773e0b260ea812\n\n📍 Location Details:\n🔗 Google Map: http://www.google.com/maps/search/?api=1&query=Akot+File+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      station_ramdaspeth:
        '*RAMDASPETH POLICE STATION*\n\n👮‍♂ Incharge: PI Shri. Shirish Khandare\n📞 Phone: 9764681906\n📧 Email: ps.ramdaspeth.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/psramdaspeth\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a59fb672773e0b260eafb3\n\n📍 Location Details:\n🔗 Google Map: http://www.google.com/maps/search/?api=1&query=Ramdaspeth+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      station_city_kotwali:
        '*CITY KOTWALI POLICE STATION*\n\n👮‍♂ Incharge: PI Shri. Sanjay Gawai\n📞 Phone: 9552534796\n📧 Email: ps.citykotwali.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/pscitykotwali\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a5910d72773e0b260eae10\n\n📍 Location Details:\n🔗 Google Maps: http://www.google.com/maps/search/?api=1&query=City+Kotwali+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      station_old_city:
        '*OLD CITY POLICE STATION*\n\n👮‍♂ Incharge: PI Nitin Levharkar\n📞 Teliphone: 9823939433\n📧 Email: ps.oldcity.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/psoldcity\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a59cc372773e0b260eaf4d\n\n📍 Location Details:\n🔗 Google Map: http://www.google.com/maps/search/?api=1&query=Old+City+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      station_khadan:
        '*KHADAN POLICE STATION*\n\n👮‍♂ Incharge: PI Manoj Kedare\n📞 Phone: 9823733032\n📧 Email: ps.khadan.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/pskhadan\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a5974672773e0b260eaed4\n\n📍 Location Details:\n🔗 Google Map: http://www.google.com/maps/search/?api=1&query=Khadan+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      station_civil_line:
        '*CIVIL LINE POLICE STATION*\n\n👮‍♂ Incharge: PI Smt. Malati Kayte\n📞 Phone: 9823680782\n📧 Email: ps.civilline.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/pscivilline\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a5958572773e0b260eae96\n\n📍 Location Details:\n🔗 Google Maps: http://www.google.com/maps/search/?api=1&query=Civil+Line+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      station_midc:
        '*MIDC POLICE STATION*\n\n👮‍♂ Incharge: API Shri. Rahul Janjal\n📞 Phone: 9850226873\n📧 Email: ps.midc.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/psmidc\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a5981572773e0b260eaee8\n\n📍 Location Details:\n🔗 Google Map: http://www.google.com/maps/search/?api=1&query=MIDC+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      station_dabki_road:
        '*DABKI ROAD POLICE STATION*\n\n👮‍♂ Incharge: API Dipak Koli\n📞 Phone: 9850841789 \n📧 Email: ps.dabkiroad.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/psdabkiroad\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a594be72773e0b260eae72\n\n📍 Location Details:\n🔗 Google Maps: http://www.google.com/maps/search/?api=1&query=Dabki+Road+Police+Station+Akola\n\n"To protect the good and destroy evil!"',

      station_akot_city:
        '*AKOT CITY POLICE STATION*\n\n👮‍♂ Incharge: PI Amol Malve\n📞 Phone: 8605117100\n📧 Email: ps.akotcity.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/psakotcity\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a5738272773e0b260ea602\n\n📍 Location Details:\n🔗 Google Map: http://www.google.com/maps/search/?api=1&query=Akot+City+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      station_akot_rural:
        '*AKOT RURAL POLICE STATION*\n\n👮‍♂ Incharge: PI Kishor Junghare\n📞 Phone: 8805987458\n📧 Email: ps.akotrural.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/psakotrural\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a57d4572773e0b260ea89a\n\n📍 Location Details:\n🔗 Google Map: http://www.google.com/maps/search/?api=1&query=Akot+Rural+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      station_dahihanda:
        '*DAHIHANDA POLICE STATION*\n\n👮‍♂ Incharge: API Shri. Gopal Dhole\n📞 Phone: 9604364406\n📧 Email: ps.dahihanda.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/psdahihanda\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a5958572773e0b260eae96\n\n📍 Location Details:\n🔗 Google Map: http://www.google.com/maps/search/?api=1&query=Dahihanda+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      station_telhara:
        '*TELHARA POLICE STATION*\n\n👮‍♂ Incharge: PI Shri. Prakash Tunkalwar\n📞 Phone: 8975753516\n📧 Email: ps.telhara.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/pstelhara\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a5a12472773e0b260eaffc\n\n📍 Location Details:\n🔗 Google Map: http://www.google.com/maps/search/?api=1&query=Telhara+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      station_hiwarkhed:
        '*HIWARKHED POLICE STATION*\n\n👮‍♂ Incharge: API Gajanan Rathod\n📞 Phone: 9822878821\n📧 Email: ps.hiwarkhed.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/pshiwarkhed\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a5966372773e0b260eaea3\n\n📍 Location Details:\n🔗 Google Map: http://www.google.com/maps/search/?api=1&query=Hiwarkhed+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      station_balapur:
        '*BALAPUR POLICE STATION*\n\n👮‍♂ Incharge: Shri. PI Prakash Zodge\n📞 Phone: 9657009727\n📧 Email: ps.balapur.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/psbalapur\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a583b972773e0b260eaacb\n\n📍 Location Details:\n🔗 Google Map: http://www.google.com/maps/search/?api=1&query=Balapur+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      station_ural:
        '*URAL POLICE STATION*\n\n👮‍♂ Incharge: API Shri. Pankaj Kamble\n📞 Phone: 7972048513\n📧 Email: ps.ural.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/psural\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a5a1ea72773e0b260eb054\n\n📍 Location Details:\n🔗 Google Map: http://www.google.com/maps/search/?api=1&query=Ural+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      station_channi:
        '*CHANNI POLICE STATION*\n\n👮‍♂ Incharge: API Ravindra Lande\n📞 Phone: 8108580999\n📧 Email: ps.channi.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/pschanni\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a58fbd72773e0b260eadec\n\n📍 Location Details:\n🔗 Google Map: http://www.google.com/maps/search/?api=1&query=Channi+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      station_patur:
        '*PATUR POLICE STATION*\n\n👮‍♂ Incharge: PI Hanumant Dopewad\n📞 Phone: 8424972277\n📧 Email: ps.patur.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/pspatur\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a59d6372773e0b260eaf51\n\n📍 Location Details:\n🔗 Google Map: http://www.google.com/maps/search/?api=1&query=Patur+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      station_murtijapur_city:
        '*MURTIZAPUR CITY POLICE STATION*\n\n👮‍♂ Incharge: PI Ajit Jadhav\n📞 Phone: 9823308230\n📧 Email: ps.murtizapurcity.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/psmurtizapurcity\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a599aa72773e0b260eaef0\n\n📍 Location Details:\n🔗 Google Map: http://www.google.com/maps/search/?api=1&query=Murtizapur+City+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      station_murtijapur_rural:
        '*MURTIZAPUR RURAL POLICE STATION*\n\n👮‍♂ Incharge: API Shridhar Guthe\n📞 Phone: +91 9850394342\n📧 Email: ps.murtizapurrural.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/psmurtizapurrural\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a59b6072773e0b260eaf11\n\n📍 Location Details:\n🔗 Google Map: http://www.google.com/maps/search/?api=1&query=Murtizapur+Rural+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      station_mana:
        '*MANA POLICE STATION*\n\n👮‍♂ Incharge: API Ganesh Nawkar\n📞 Telephone: 7570552954\n📧 Email: ps.mana.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/psmana\n🌐 Website: https://www.akolapolice.gov.in/\n\n📍 Location Details:\n🔗 Google Map: http://www.google.com/maps/search/?api=1&query=Mana+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      station_barshitakli:
        '*BARSHITAKLI POLICE STATION*\n\n👮‍♂ Incharge: PI Shri. Praveen Dhumal\n📞 Phone: +91 8420246968\n📧 Email: ps.barshitakli.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/psbarshitakli\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a5877c72773e0b260eab8d\n\n📍 Location Details:\n🔗 Google Map: http://www.google.com/maps/search/?api=1&query=Barshitakli+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      station_pinjar:
        '*PINJAR POLICE STATION*\n\n👮‍♂ Incharge: API Gangadhar Darade\n📞 Phone: 9923416668\n📧 Email: ps.pinjar.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/pspinjar\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a59e9272773e0b260eaf85\n\n📍 Location Details:\n🔗 Google Map: http://www.google.com/maps/search/?api=1&query=Pinjar+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      station_borgaon_manju:
        '*BORGAON MANJU POLICE STATION*\n\n👮‍♂ Incharge: PI Anil Gopal\n📞 Phone: 9881866768\n📧 Email: ps.borgaonmanju.akola@mahapolice.gov.in\n🔹 Twitter (X): https://x.com/psborgaonmanju\n🌐 Website: https://www.akolapolice.gov.in/police-station/67a58e6c72773e0b260ead9d\n\n📍 Location Details:\n🔗 Google Map: http://www.google.com/maps/search/?api=1&query=Borgaon+Manju+Police+Station+Akola\n\n"To protect the good and to destroy evil!"',

      // -----------------------
      // District Special Branch
      // -----------------------
      dsb_service_1:
        "🌍 *NOC for Foreign Nationals*\n\nThis service provides a No Objection Certificate (NOC) for foreign nationals as per government guidelines.\n\n🔗 To use this service, select the URL and generate your ID.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      dsb_service_2:
        "🛂 *Police Clearance Certificate (PCC)*\n\nIssued to certify that an individual has no criminal record or pending cases, required for jobs, visas, or studies abroad.\n\n🔗 To use this service, select the URL and generate your ID.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      dsb_service_3:
        "📑 *Forwarding Proposals to GOI*\n\nOfficial proposals related to security and citizen services are forwarded to the Government of India for approval.\n\n🔗 To use this service, select the URL and generate your ID.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      dsb_service_4:
        "🕒 *Stay Extension*\n\nExtension of stay for foreign nationals residing in India beyond the permitted period, subject to verification and approval.\n\n🔗 To use this service, select the URL and generate your ID.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      dsb_service_5:
        "🔙 *NOC for Returning Citizens*\n\nA No Objection Certificate (NOC) is issued for citizens returning to India for residence or work purposes.\n\n🔗 To use this service, select the URL and generate your ID.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      dsb_service_6:
        "💼 *Employment NOC*\n\nThis certificate verifies the individual’s record and provides clearance for government or private employment.\n\n🔗 To use this service, select the URL and generate your ID.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      dsb_service_7:
        "✈️ *Travel Police Clearance*\n\nPolice clearance certificate required for travel, visas, or higher studies abroad.\n\n🔗 To use this service, select the URL and generate your ID.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      dsb_service_8:
        "🌏 *Tibetan NOC*\n\nNo Objection Certificate (NOC) issued for Tibetan citizens to enter or return to India.\n\n🔗 To use this service, select the URL and generate your ID.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      // -----------------------
      // Other Branches
      // -----------------------
      ob_service_1:
        "🎭 *Foreign Artist Permission*\n\nPermission for foreign artists to perform or participate in cultural and entertainment events in India.\n\n🔗 To use this service, select the URL and generate your ID.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      ob_service_2:
        "📜 *Document Attestation*\n\nOfficial verification and attestation of important personal or legal documents.\n\n🔗 To use this service, select the URL and generate your ID.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      ob_service_3:
        "📄 *Copy of FIR*\n\nCertified copy of the First Information Report (FIR) provided to the complainant for legal or personal use.\n\n🔗 To use this service, select the URL and generate your ID.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      ob_service_4:
        "🔊 *Loudspeaker Permit*\n\nPermission for the use of loudspeakers for events, functions, or announcements, as per regulations.\n\n🔗 To use this service, select the URL and generate your ID.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      ob_service_5:
        "🎶 *Entertainment NOC*\n\nNo Objection Certificate (NOC) issued for conducting cultural, musical, or entertainment programs.\n\n🔗 To use this service, select the URL and generate your ID.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      ob_service_6:
        "📢 *Meeting/Parade Permit*\n\nPermission for holding meetings, rallies, parades, or public gatherings.\n\n🔗 To use this service, select the URL and generate your ID.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      ob_service_7:
        "🏪 *Business NOC*\n\nNo Objection Certificate for petrol pumps, gas agencies, hotels, bars, and other commercial establishments.\n\n🔗 To use this service, select the URL and generate your ID.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      ob_service_8:
        "🔫 *Firearm License NOC*\n\nNOC issued for obtaining a firearm license, subject to eligibility and background verification.\n\n🔗 To use this service, select the URL and generate your ID.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      // ===== Event Intimation =====
      event_navratri:
        "📢 *Akola Police Awareness Message* 🗳️\n\n🇮🇳 *Celebrate the festival of democracy peacefully and responsibly!*\n\n✅ Vote responsibly – it is your right and duty.\n🚫 Do not spread rumors or share false information.\n💬 Be respectful on social media and follow the law.\n👀 If you notice any suspicious activity, illegal campaigning, or disturbance, inform the police immediately.\n\n👮‍♂ *Akola Police – Always ready for your safety!* 🚔\n📞 *Emergency Number:* 112\n\n🕊 *Vote peacefully, strengthen democracy, and maintain harmony!*",
      event_prahar:
        "🟢 Operation Prahar Update\n\n📅 25/05/2025 – 31/10/2025\n\n🚔 Major Actions:\n🌿 NDPS Act: 11 cases | ₹2,23,550\n🔫 Arms Act: 123 cases | ₹12,55,100\n🐄 Animal Protection: 51 cases | ₹1,98,28,816\n💊 ESC Act: 11 cases | ₹15,79,466\n🚬 Gutkha Act: 827 cases | ₹54,04,997\n🍾 Liquor Act: 465 cases | ₹41,68,676\n🎲 Gambling Act: 19 cases | ₹3,52,13,612\n\n💰 Total: 1507 cases | ₹3.52 Cr seized\n\n⚖ Legal Action:\n🧾 MPDA – 12\n📜 MCOCA – 10\n🔹 55/56 Section – 14\n\n🐂 Seizure Info:\n🐄 Cattle Rescued – 196\n🥩 Beef – 2543 kg\n🚗 Vehicles – 37\n🧑🏻‍🦱 Accused – 120\n\n🔥 Great work by Operation Prahar team! 💪",
      event_udan:
        "🌍 On *World Anti-Drug Day*, Akola District Police launched *MISSION Udaan: A Pledge for a Drug-Free Life* 🚭✨. 'Mission Udaan' is a commendable initiative 👮‍♂️💙. For more details, visit 🔗 https://akolapolice.gov.in/initiatives",
      event_raksha_qr:
        "🛡️ *Feedback on Raksha Initiative* 📝\n\nThis unique security project by Akola Police is proving to be highly beneficial.\n\n✅ Immediate police assistance is available.\n✅ Especially useful for women, senior citizens, and students.\n✅ Easily accessible in public places and institutions.\n\n🚔 This initiative is quick, reliable, and truly citizen-friendly!\n\n👉 *Click here to submit your feedback:* https://www.sevapolice.co.in/AkolaDist/user/ps_sp_office.php",
    },
    invalidInput:
      "❌ Invalid selection. Please choose from the given options or type 'menu' to start over,\n🚨Emergency Contacts: 112",
  },
  mr: {
    navigation: {
      previous: "⬅️ मागील मेनू",
      main: "🏠 मुख्य मेनू",
    },
    mainMenu: {
      header: "👮‍♂ अकोला पोलीस",
      body: "\n━━━━━━━━━\nआम्ही प्रत्येक नागरिकास प्रामाणिकपणा, पारदर्शकता व जबाबदारी या मूल्यांसह सेवा देण्यास कटिबद्ध आहोत.\nआपली सुरक्षा, विश्वास व निश्चिंतता हीच आमची सर्वोच्च प्राथमिकता आहे.\n\nअकोला पोलिसांच्या माध्यमातून आपण महत्त्वाच्या पोलीस सेवा, तक्रार नोंदणी व सत्य माहिती कोणत्याही वेळी, कुठेही मिळवू शकता.\n\nचला मिळून एक सुरक्षित, निर्भय व लोकाभिमुख पोलिस ठाणे घडवूया.\n\n🌐 https://www.akolapolice.gov.in",

      buttonText: "🔽 सेवा निवडा",
      sections: [
        {
          title: "👮 नागरिक सेवा",
          rows: [
            {
              id: "our_services",
              title: "🛂 सेवा",
              description: "वाहतूक, RTS (एकूण १७/१७), व्हॉट्सॲप चॅनेल.",
            },
            {
              id: "event_intimation",
              title: "📢 कार्यक्रम माहिती",
              description: "महत्वाच्या उपक्रमांची माहिती.",
            },
            {
              id: "cyber_issues",
              title: "💻 सायबर समस्या",
              description: "सायबर गुन्हा, फसवणूक, हॅक खाते तक्रार.",
            },
            {
              id: "emergency_contacts",
              title: "🚨 आपत्कालीन",
              description: "तातडीच्या मदतीसाठी हेल्पलाइन क्रमांक.",
            },
          ],
        },
        {
          title: "ℹ️ माहिती व ट्रॅकिंग",
          rows: [
            {
              id: "complaint_register",
              title: "📝 तक्रार",
              description: "सेवा द्वारे नवीन तक्रार.",
            },
            {
              id: "track_complaint",
              title: "🔎 तक्रार ट्रॅक",
              description: "तक्रारीची स्थिती तपासा.",
            },
            {
              id: "know_akola_police",
              title: "🏢 अकोला पोलीस",
              description: "पोलीस स्टेशन, शाखा, अधिकारी माहिती.",
            },
          ],
        },
        {
          title: "🌐 नागरिक कॉर्नर",
          rows: [
            {
              id: "public_awareness",
              title: "📢 जनजागृती",
              description: "माहिती व सुरक्षा टिप्स.",
            },
            {
              id: "citizen_responsibility",
              title: "🤝 नागरिक जबाबदारी",
              description: "नागरिक म्हणून तुमची भूमिका.",
            },
          ],
        },
      ],
    },

    ourServicesMenu: {
      header: "🛂 सेवा",
      body: "सेवा पर्याय निवडा.",
      buttonText: "📋 सेवा पहा",
      sections: [
        {
          title: "उपलब्ध सेवा",
          rows: [
            {
              id: "major_services",
              title: "⭐ सेवा हक्क अधिनियम",
              description: "नागरिक सेवा हक्क अधिनियम (RTS)",
            },
            {
              id: "passport_info",
              title: "🛂 पासपोर्ट",
              description: "पासपोर्ट संबंधित सेवा.",
            },
            {
              id: "police_verification_info",
              title: "📑 पोलीस पडताळणी",
              description: "पडताळणी संबंधित सेवा.",
            },
            {
              id: "traffic_service_info",
              title: "🚦 वाहतूक सेवा",
              description: "वाहतूक व चालान संबंधित माहिती.",
            },
            {
              id: "whatsapp_channel_info",
              title: "📲 व्हॉट्सॲप चॅनेल",
              description: "आमच्या अधिकृत चॅनेलवर अपडेट मिळवा.",
            },
          ],
        },
      ],
    },

    majorServicesMenu: {
      header: "⭐ प्रमुख RTS सेवा",
      body: "कृपया सेवा विभाग निवडा.",
      buttonText: "📋 विभाग पहा",
      sections: [
        {
          title: "सेवा विभाग",
          rows: [
            {
              id: "district_special_branch",
              title: "🏢 जिल्हा शाखा",
              description: "जिल्हा विशेष शाखेतील सेवा निवडा.",
            },
            {
              id: "other_branches",
              title: "🏛️ इतर शाखा",
              description: "इतर शाखांतील सेवा निवडा.",
            },
          ],
        },
      ],
    },

    eventIntimationMenu: {
      header: "📢 कार्यक्रम माहिती",
      body: "कार्यक्रम निवडा.",
      buttonText: "📋 कार्यक्रम पहा",
      sections: [
        {
          title: "🌟 महत्वाचे उपक्रम",
          rows: [
            {
              id: "event_navratri",
              title: "🗳️ निवडणूक जनजागृती",
              description: "लोकशाहीचा उत्सव शांततेत आणि जबाबदारीने पार पाडा!",
            },
            {
              id: "event_prahar",
              title: "🚔 ऑपरेशन प्रहार",
              description: "गुन्हे विरोधी अभियान.",
            },
            {
              id: "event_udan",
              title: "✈️ मिशन उडान",
              description: "युवा सुरक्षा व जनजागृती.",
            },
            {
              id: "event_raksha_qr",
              title: "🛡️ रक्षा लिंक",
              description: "आधारित सुरक्षा उपक्रम.",
            },
          ],
        },
      ],
    },

    districtSpecialBranchMenu: {
      header: "🏢 जिल्हा विशेष शाखा",
      body: "कृपया सेवा निवडा.",
      buttonText: "📋 सेवा पहा",
      sections: [
        {
          title: "जिल्हा शाखा सेवा",
          rows: [
            {
              id: "dsb_service_1",
              title: "🌍 परदेशी NOC",
              description: "परदेशी नागरिकांसाठी NOC.",
            },
            {
              id: "dsb_service_2",
              title: "🛂 पोलिस क्लिअरन्स",
              description: "पोलिस क्लिअरन्स प्रमाणपत्र (PCC).",
            },
            {
              id: "dsb_service_3",
              title: "📑 प्रस्ताव GOI ला",
              description: "भारत सरकारकडे प्रस्ताव पाठवणे.",
            },
            {
              id: "dsb_service_4",
              title: "🕒 वास्तव्य वाढवणे",
              description: "परदेशी नागरिकांचे वास्तव्य वाढवणे.",
            },
            {
              id: "dsb_service_5",
              title: "🔙 परत येण्यासाठी NOC",
              description: "भारतामध्ये परत येण्यासाठी NOC.",
            },
            {
              id: "dsb_service_6",
              title: "💼 नोकरी NOC",
              description: "नोकरीसाठी संबंधित NOC.",
            },
            {
              id: "dsb_service_7",
              title: "✈️ प्रवास PCC",
              description: "परदेश प्रवासासाठी पोलिस क्लिअरन्स.",
            },
            {
              id: "dsb_service_8",
              title: "🌏 तिबेटियन NOC",
              description: "तिबेटियन नागरिकांसाठी NOC.",
            },
          ],
        },
      ],
    },

    otherBranchesMenu: {
      header: "🏛️ इतर शाखा",
      body: "कृपया सेवा निवडा.",
      buttonText: "📋 सेवा पहा",
      sections: [
        {
          title: "इतर शाखा सेवा",
          rows: [
            {
              id: "ob_service_1",
              title: "🎭 कलाकार परवानगी",
              description: "परदेशी कलाकारांसाठी परवानगी.",
            },
            {
              id: "ob_service_2",
              title: "📜 कागदपत्र सत्यापन",
              description: "अधिकृत कागदपत्रांची प्रमाणित तपासणी.",
            },
            {
              id: "ob_service_3",
              title: "📄 FIR प्रत",
              description: "पहिल्या माहिती अहवालाची प्रत.",
            },
            {
              id: "ob_service_4",
              title: "🔊 लाउडस्पीकर परवाना",
              description: "लाउडस्पीकर वापरण्याची परवानगी.",
            },
            {
              id: "ob_service_5",
              title: "🎶 कार्यक्रम NOC",
              description: "मनोरंजन कार्यक्रमांसाठी NOC.",
            },
            {
              id: "ob_service_6",
              title: "📢 सभा परवानगी",
              description: "सभा व मिरवणुकींसाठी परवानगी.",
            },
            {
              id: "ob_service_7",
              title: "🏪 व्यवसाय NOC",
              description: "पेट्रोल पंप, हॉटेल, बार इत्यादींसाठी NOC.",
            },
            {
              id: "ob_service_8",
              title: "🔫 शस्त्र परवाना NOC",
              description: "शस्त्र परवाना मिळवण्यासाठी NOC.",
            },
          ],
        },
      ],
    },

    knowAkolaPoliceMenu: {
      header: "🏢 अकोला पोलीस",
      body: "अधिक माहिती मिळविण्यासाठी निवडा.",
      buttonText: "📖 माहिती पहा",
      sections: [
        {
          title: "📂 विभाग व माहिती",
          rows: [
            {
              id: "police_stations_branches",
              title: "🚔 ठाणे व शाखा",
              description: "ठाणे व शाखांची माहिती.",
            },
            {
              id: "senior_police_officers",
              title: "👮 वरिष्ठ अधिकारी",
              description: "वरिष्ठ अधिकाऱ्यांची यादी.",
            },
            {
              id: "history_akola_police",
              title: "📜 इतिहास",
              description: "इतिहासाबद्दल जाणून घ्या.",
            },
          ],
        },
      ],
    },

    policeStationsBranchesMenu: {
      header: "🚔 ठाणे व शाखा",
      body: "विभाग किंवा शाखा निवडा.",
      buttonText: "📋 विकल्प निवडा",
      sections: [
        {
          title: "🏢 पोलीस विभाग",
          rows: [
            { id: "city_division", title: "🏙️ सिटी विभाग" },
            { id: "akot_division", title: "🌾 अकोट विभाग" },
            { id: "balapur_division", title: "🏞️ बाळापूर विभाग" },
            { id: "murtijapur_division", title: "🚉 मूर्तिजापूर विभाग" },
          ],
        },
        {
          title: "🛡️ पोलीस शाखा",
          rows: [
            { id: "branch_control_room", title: "🎛️ कंट्रोल रूम" },
            { id: "branch_lcb", title: "🔎 लोकल क्राइम ब्रांच" },
            { id: "branch_cyber_cell", title: "💻 सायबर सेल" },
            { id: "branch_bharosa_cell", title: "🤝 भरोसा सेल" },
            { id: "branch_traffic", title: "🚦 ट्रॅफिक शाखा" },
            { id: "branch_dsb", title: "📂 विशेष शाखा" },
          ],
        },
      ],
    },

    cyberIssuesMenu: {
      header: "💻 सायबर समस्या",
      body: "कृपया तुमची समस्या निवडा.",
      buttonText: "⚡ समस्या निवडा",
      sections: [
        {
          title: "🛡️ सायबर गुन्हे मदत",
          rows: [
            {
              id: "victim_of_cybercrime",
              title: "😞 सायबर बळी",
              description: "जर तुम्ही सायबर गुन्ह्याचा बळी असाल.",
            },
            {
              id: "lost_stolen_mobile",
              title: "📱 हरवलेला मोबाईल",
              description: "हरवलेला मोबाईल रिपोर्ट करा व ब्लॉक करा.",
            },
            {
              id: "social_media_hacked",
              title: "🔐 हॅक झालेले खाते",
              description: "हॅक झालेल्या खात्यांसाठी मदत मिळवा.",
            },
            {
              id: "online_financial_fraud",
              title: "💰 ऑनलाइन फसवणूक",
              description: "आर्थिक फसवणूक व घोटाळ्यांची माहिती.",
            },
            {
              id: "cyber_volunteer",
              title: "🤝 सायबर स्वयंसेवक",
              description: "MHA चा I4C कार्यक्रम जॉइन करा.",
            },
            {
              id: "bank_account_hold",
              title: "🏦 बँक होल्ड",
              description: "बँक खाते होल्ड झाल्यास काय करावे.",
            },
            {
              id: "sanchar_saathi",
              title: "📞 संचार साथी",
              description:
                "तुमच्या नावावर किती मोबाईल कनेक्शन आहेत ते जाणून घ्या.",
            },
          ],
        },
      ],
    },

    cityDivisionStations: {
      header: "शहर विभाग ठाणे",
      body: "तपशीलांसाठी ठाणे निवडा.",
      buttonText: "🏙️ शहर ठाणे",
      sections: [
        {
          title: "ठाणे",
          rows: [
            { id: "station_akot_file", title: "📄 अकोट फाइल" },
            { id: "station_ramdaspeth", title: "🛣️ रामदासपेठ" },
            { id: "station_city_kotwali", title: "🏢 सिटी कोतवाली" },
            { id: "station_old_city", title: "🏛️ जुने शहर" },
            { id: "station_khadan", title: "⛏️ खदान" },
            { id: "station_civil_line", title: "🏤 सिव्हिल लाईन" },
            { id: "station_midc", title: "🏭 एम.आय.डी.सी" },
            { id: "station_dabki_road", title: "🛤️ डाबकी रोड" },
          ],
        },
      ],
    },

    akotDivisionStations: {
      header: "अकोट विभाग ठाणे",
      body: "तपशीलांसाठी ठाणे निवडा.",
      buttonText: "🌇 अकोट ठाणे",
      sections: [
        {
          title: "ठाणे",
          rows: [
            { id: "station_akot_city", title: "🏙️ अकोट शहर" },
            { id: "station_akot_rural", title: "🌾 अकोट ग्रामीण" },
            { id: "station_dahihanda", title: "🏡 दहीहांडा" },
            { id: "station_telhara", title: "🌳 तेल्हारा" },
            { id: "station_hiwarkhed", title: "🌿 हिवरखेड" },
          ],
        },
      ],
    },

    balapurDivisionStations: {
      header: "बाळापूर विभाग ठाणे",
      body: "तपशीलांसाठी ठाणे निवडा.",
      buttonText: "🏡 बाळापूर ठाणे",
      sections: [
        {
          title: "ठाणे",
          rows: [
            { id: "station_balapur", title: "🏘️ बाळापूर" },
            { id: "station_ural", title: "🌾 उरळ" },
            { id: "station_channi", title: "🏠 चान्नी" },
            { id: "station_patur", title: "🌳 पातूर" },
          ],
        },
      ],
    },

    murtijapurDivisionStations: {
      header: "मूर्तिजापूर विभाग ठाणे",
      body: "तपशीलांसाठी ठाणे निवडा.",
      buttonText: "🚉 मूर्तिजापूर",
      sections: [
        {
          title: "ठाणे",
          rows: [
            { id: "station_murtijapur_city", title: "🏙️ मूर्तिजापूर शहर" },
            { id: "station_murtijapur_rural", title: "🌾 मूर्तिजापूर ग्रामीण" },
            { id: "station_mana", title: "🏡 माना" },
            { id: "station_barshitakli", title: "🌳 बार्शिटाकळी" },
            { id: "station_pinjar", title: "🌿 पिंजर" },
            { id: "station_borgaon_manju", title: "🏠 बोरगाव मंजू" },
          ],
        },
      ],
    },

    // ...MainMenu, ourServicesMenu etc. all remain the same...
    infoTexts: {
      passport_info:
        "🛂 *पासपोर्ट सेवा* 🛂\n\n🔹 नवीन पासपोर्टसाठी अर्ज करा\n🔹 पासपोर्ट अर्ज स्थिती तपासा\n🔹 आवश्यक कागदपत्रे\n\n🌐 अधिक माहितीसाठी अधिकृत संकेतस्थळ पहा: https://www.passportindia.gov.in",

      police_verification_info:
        "📋 *पोलीस पडताळणी* 📄\n\n🔹 पोलीस प्रमाणपत्रासाठी अर्ज करा\n🔹 पडताळणी स्थिती तपासा\n🔹 आवश्यक कागदपत्रे\n\n🌐 अधिक माहितीसाठी अधिकृत संकेतस्थळ पहा: https://pcs.mahaonline.gov.in/Forms/Home.aspx",

      traffic_service_info:
        "🚦 *वाहतूक सेवा* 🚦\n\n🔹 दंड तपासा व भरा\n🔹 वाहतूक नियम उल्लंघन नोंदवा\n🔹 रस्त्याच्या सुरक्षिततेचे नियम जाणून घ्या\n\n🌐 अधिक माहितीसाठी अधिकृत संकेतस्थळ पहा: https://mahatrafficechallan.gov.in/payechallan/PaymentService.htm",

      whatsapp_channel_info:
        " *🛂 WhatsApp Channel* 🤖\n\n🚨 *अकोला पोलीस*🚔\nनागरिकांच्या सेवेत... 🗣 नवीन डिजिटल माध्यम घेऊन आले आहे\n🚔 अकोला पोलीस व्हॉट्सॲप चॅनल📡\nAKOLA POLICE WhatsApp Channel ला कसे follow करावे ? 👆🏻\n\n📡 WhatsApp Channel link👇🏻\nhttps://whatsapp.com/channel/0029Vb5zl1ELo4hg5l5kgd2D\n\nअधिकृत Twitter (X) भेट द्या:\n- https://x.com/Akolapolice",

      victim_of_cybercrime:
        "*सायबर गुन्ह्याचा बळी?*\nतात्काळ कारवाई करा! 💻\n\n- जर तुम्ही सायबर गुन्हेगारांचे लक्ष्य बनला असाल, तर नुकसान कमी करण्यासाठी आणि तुमची झालेली हानी भरून काढण्यासाठी त्वरित कारवाई करा.\n\n📞 आवश्यक मदत क्रमांक:\n🌐 राष्ट्रीय सायबर गुन्हे नोंदणी पोर्टल: 🔗 cybercrime.gov.in (ऑनलाईन तक्रार नोंदवा)\n📞 सायबर गुन्हे मदत क्रमांक: 1930\n🌐 https://cyberpolicediary.netlify.app\n\n⏳ वेळ खूप महत्त्वाची आहे! तुम्ही जितक्या लवकर तक्रार कराल, तितकी अधिक नुकसान टाळण्याची आणि सायबर गुन्हेगारांचा मागोवा घेण्याची शक्यता जास्त असते. 🛡\n\n🚔 तात्काळ मदतीसाठी तुमच्या जवळच्या पोलीस स्टेशनला भेट द्या.",

      lost_stolen_mobile:
        "*हरवलेल्या किंवा चोरीला गेलेल्या मोबाईलची तक्रार नोंदवण्याचे मार्गदर्शन📱*  \n\n• तुमचा मोबाईल हरवला का? तत्काळ कारवाई करा! 💻🔍\n- जर तुमचा मोबाईल फोन हरवला किंवा चोरीला गेला असेल, तर तुमचा डेटा सुरक्षित ठेवण्यासाठी आणि गैरवापर टाळण्यासाठी त्वरित कारवाई करा.\n\n- तुमचा हरवलेला मोबाईल ऑनलाइन तक्रार करून ब्लॉक करा:\n- CEIR पोर्टल - तक्रार नोंदवा ( https://www.ceir.gov.in/Request/CeirUserBlockRequestDirect.jsp )\n\n- CEIR व्हिडिओ मार्गदर्शन पहा:\n- 📺 हरवलेल्या मोबाईलची तक्रार कशी करावी ( https://www.instagram.com/share/reel/BAicP1lYfO )\n📱 मोबाईल फोन पुनर्प्राप्ती | अकोला पोलीस यांनी पोलीस अधीक्षक, अकोला यांच्या नेतृत्वाखाली, 700 हून अधिक हरवलेले मोबाईल फोन त्यांच्या योग्य मालकांना यशस्वीरित्या परत केले आहेत.\n- अधिक माहितीसाठी :- https://x.com/AkolaPolice/status/1901493532344610864?t=lCrrNli3i8CvSyGqFzAxOQ&s=19\n\nअधिक मार्गदर्शनासाठी तुमच्या जवळच्या पोलीस स्टेशनला भेट द्या. 🚔",

      social_media_hacked:
        "🚔 तुमचे सोशल मीडिया खाते हॅक झाले आहे? आता कारवाई करा! 🔐📱\n\n- जर तुमचे सोशल मीडिया खाते हॅक झाले असेल किंवा धोक्यात आले असेल, तर खालील उपाय लगेच करा:\n\n🔒 तुमचे खाते सुरक्षित करा:\n- तुमचा पासवर्ड मजबूत आणि अद्वितीय (युनिक) ठेवा.\n- अतिरिक्त सुरक्षिततेसाठी दोन-घटक प्रमाणीकरण (2FA) सक्षम करा.\n- कनेक्ट केलेल्या ॲप्सची तपासणी करा आणि संशयास्पद ॲप्सचा ॲक्सेस रद्द करा.\n\n📩 प्लॅटफॉर्मवर तक्रार नोंदवा -\n- फेसबुक, इंस्टाग्राम, व्हॉट्सॲप इत्यादींच्या सपोर्ट सेंटरद्वारे तक्रार करा.\n- 🌐 - https://cyberpolicediary.netlify.app\n\n🔹 सायबर जनजागृती टीप:\n- नियमितपणे पासवर्ड अपडेट करा आणि सुरक्षा सूचना सक्षम करा.\n- नवीन सायबर धोके आणि घोटाळ्यांबद्दल माहिती ठेवा.\n- 🌐 भेट द्या: https://cybercrime.gov.in/Webform/CyberAware.aspx\n\n⚡ त्वरित कारवाई करा, सुरक्षित राहा आणि तुमची ऑनलाइन ओळख सुरक्षित ठेवा! 🎓",

      online_financial_fraud:
        "*ऑनलाइन आर्थिक फसवणुकीपासून सावध राहा!* 💳🔍\n\n⚠ सामान्य प्रकार:\n- 🆔 ओळख चोरी: वैयक्तिक तपशीलांचा गैरवापर\n- 💳 क्रेडिट कार्ड फसवणूक: चोरी झाल्या कार्डने अनधिकृत व्यवहार\n- 📉 गुंतवणूक घोटाळे: बनावट योजना, उच्च परतावा वचन\n- 📦 ऑनलाइन खरेदी घोटाळे: अस्तित्वात नसलेली उत्पादने\n- डिजिटल अटक घोटाळा: बनाव सरकारी अधिकारी\n🌐 https://cybercrime.gov.in/webform/crimecatdes.aspx\n\n🛡 सुरक्षित राहा:\n- वैयक्तिक तपशील शेअर करू नका\n- मजबूत पासवर्ड व 2FA वापरा\n- सॉफ्टवेअर अपडेट ठेवा\n- बँक स्टेटमेंट तपासा\n🌐 https://cybercrime.gov.in/Webform/Crime_OnlineSafetyTips.aspx\n\n🚔 संशय असल्यास:\n- बँकेला कळवा\n- राष्ट्रीय सायबर पोर्टलवर तक्रार\n- चक्षु पोर्टल: https://sancharsaathi.gov.in/sfc/\n- मार्गदर्शन: https://www.instagram.com/reel/DDywO7rSc7H/?igsh=MTB5b2w3NW1ocGZrcg==\n\n🔹 जनजागृती: कार्यशाळा उपस्थित रहा, इतरांना शिक्षित करा 🌐 https://x.com/Cyberdost",

      cyber_volunteer:
        'गृह मंत्रालयाच्या (MHA) अंतर्गत I4C द्वारे "सायबर स्वयंसेवक कार्यक्रम" सुरू 🚔\n\n🔹 उद्देश: नागरिकांना सहभागी करून सुरक्षित डिजिटल वातावरण तयार करणे.\n\nस्वयंसेवक भूमिका:\n- बेकायदेशीर सामग्री फ्लॅगर\n- सायबर जागरूकता प्रवर्तक\n- सायबर तज्ञ\n\nनोंदणी प्रक्रिया:\n- अधिकृत पोर्टलला भेट द्या: https://cybercrime.gov.in/Webform/CyberVolunteerinstruction.aspx\n- प्रोफाइल तयार करून आवश्यक कागदपत्रे अपलोड करा\n- भूमिका निवडा आणि अर्ज सबमिट करा ✅\n\n🌐 व्हिडिओ मार्गदर्शन: https://youtu.be/nxCJv6ywO6Y?feature=shared\n\nसंपर्क:\n📞 0724-2445319 | 📱 WhatsApp: 8275599668\nTwitter (X): https://x.com/Cyberdost',

      bank_account_hold:
        "*Bank Account Has Been Put On Hold.*\n\n-\n\nमराठी -\nविषय: सावधान: आपल्या बँक खात्यात संशयास्पद गतिविधी आढळली.\n\nमाननीय महोदय/महोदया,\nआम्हाला तुमच्या बँक खात्यात संशयास्पद गतिविधी आढळली आहे. या समस्येवर तात्काळ उपाय करण्यासाठी, आम्ही आपणास महाराष्ट्र सायबर हेल्पलाइनशी संपर्क साधण्याची विनंती करतो.\nखाली दिलेल्या संपर्क माहितीद्वारे तुमची चिंता ईमेल किंवा व्हॉट्सॲप संदेशाद्वारे पाठवा. आम्हाला तुमची संपर्क माहिती मिळाल्यावर, आमची टीम तुमच्याशी संपर्क साधेल आणि जल्हआतशी हा प्रश्न सोडवण्यात मदत करेल.\nईमेल आयडी: mhcyber.helpline1930@mahapolice.gov.in\nContact number - 07242445319\nContact number - 8657013913\n\nआपल्या लक्ष्य आणि सहकार्याबद्दल धन्यवाद.\nनिष्ठांपूर्वक,\nमहाराष्ट्र सायबर हेल्पलाइन टीम\nअकोला पोलीस\n\nआपके ध्यान और सहयोग के लिए धन्यवाद।\nभवदीय,\nमहाराष्ट्र साइबर हेल्पलाइन टीम\nअकोला पुलिस\n\n📍📍📍📍📍📍",

      sanchar_saathi:
        "*संचार साथी*\n\nतुमच्या नावावर किती सिम कार्ड्स जारी झाली आहेत हे जाणून घ्यायचंय का? 📱🔍\nअनधिकृत कनेक्शन्स 🚫 शोधण्यासाठी आणि तक्रार नोंदवण्यासाठी Sanchar Saathi वापरा.\n\n📥 आजच Sanchar Saathi अँप डाउनलोड करा:\n👉 Android: https://play.google.com/store/apps/details?id=com.dot.app.sancharsaathi\n👉 iOS: https://apps.apple.com/in/app/sanchar-saathi/id6739700695\n🌐 वेबसाईट: https://sancharsaathi.gov.in",
      emergency_contacts:
        "📞 आपत्कालीन परिस्थितीत ११२ वर डायल करा🚔\n\n📌 आवश्यक हेल्पलाइन क्रमांक:\n☎ नियंत्रण कक्ष: ०७२४-२४३५५००\n📱 नियंत्रण कक्ष व्हाट्सअ‍ॅप: ८८०५४ ६११००\n👮‍♀ दामिनी पथक (महिला सुरक्षा): ७४४७४ १००१५\n🚦 वाहतूक नियंत्रण: ०७२४-२४४५३१४\n💻 सायबर हेल्पलाइन: १९३०, १९४५ 🔗 येथे क्लिक करा ( https://cybercrime.gov.in )\n📋 सर्व महत्वाचे संपर्क : 🔗 येथे क्लिक करा ( https://www.akolapolice.gov.in/imp-contacts )\n\n⚠ सुरक्षित राहा, सतर्क राहा! 💙",

      //Remove the below link and add the provided link here https://www.sevapolice.co.in/AkolaDist/user/ps_entry.php <-- remove this link add new below
      complaint_register:
        "✍️ *तक्रार नोंदवा*\n\n🕵️‍♂️ खालील लिंकवर क्लिक करून फॉर्म भरा आणि आपली तक्रार ऑनलाईन सबमिट करा.\n\n🌐 https://www.sevapolice.co.in/AkolaDist/user/ps_entry.php\n\n📄 आपले सहकार्य सुरक्षितता आणि न्याय राखण्यास मदत करते.",

      track_complaint:
        "👮‍♂ नमस्कार!\n\nआपली चॅटबॉटद्वारे नोंद झालेली तक्रार पोलीस स्टेशनमध्ये पडताळणी झाल्यानंतर आपण ती येथे ट्रॅक करू शकता.\n\n📱 कृपया आपला *१० अंकी मोबाईल नंबर* पाठवा, तक्रारीची स्थिती जाणून घेण्यासाठी. ✅",
      track_complaint_invalid:
        "❌ हा मोबाइल क्रमांक योग्य नाही. कृपया पुन्हा प्रयत्न करा.",
      track_complaint_success: "🔗 तुमचा तक्रार ट्रॅकिंग लिंक:",

      public_awareness:
        "*🔹 आपली सुरक्षितता, आमची प्राधान्यक्रम! 🔹*\n\nआमच्या लोककल्याण कामगिरी 🚀 पाहण्यासाठी भेट द्या 👇\nhttps://akolapolice.gov.in/good-work\n\n📌 रस्ता सुरक्षा 🚦\n- हेल्मेट वापरा 🏍🪖\n- सिग्नल पालन करा 🚥\n- निष्काळजी वाहनचालक टाळा ⚠\nhttps://www.akolapolice.gov.in/citizen-alertwall\n\n📌 सायबर सुरक्षा 💻🔒\n- OTP/पासवर्ड शेअर करू नका 🔑🚫\n- फसवेगिरीपासून सावध 🕵‍♂\n- लिंक क्लिक करण्याआधी खात्री करा 🔗⚠\nhttps://x.com/cybercellakola\n\n📌 सामाजिक जबाबदारी 🤝\n- अफवा पसरवू नका ❌\n- परिसर स्वच्छ ठेवा 🌍♻\n- गरजू लोकांना मदत करा ❤\nhttps://www.akolapolice.gov.in/citizen-alertwall\n\nआपत्कालीन 112 कॉल 📲🚔\nफॉलो करा: https://x.com/AkolaPolice | www.akolapolice.gov.in",
      citizen_responsibility:
        "🌟 अकोल्याचे जबाबदार नागरिक म्हणून शहराची सुरक्षा, सौहार्द आणि प्रगती टिकवणे आपले कर्तव्य आहे.\n\n1. कायद्याचे पालन करा – वाहतूक, नागरी आणि सायबर नियम पाळा.\n2. गुन्हे कळवा – फसवणूक किंवा संशयास्पद कृती त्वरित पोलिसांना सांगा.\n3. स्वच्छता ठेवा – सार्वजनिक ठिकाणे स्वच्छ व सुरक्षित ठेवा.\n4. सर्वांचा आदर करा – ऐक्य वाढवा, द्वेष व चुकीची माहिती टाळा.\n5. सुरक्षेस हातभार लावा – पोलिस आणि समाजास सहकार्य करा.\n6. शासकीय सेवा वापरा – फक्त अधिकृत आणि विश्वासार्ह स्रोतांवर भरोसा ठेवा.\n7. सज्ज रहा – आपत्कालीन क्रमांक व प्रक्रिया जाणून ठेवा.\n\nचला मिळून सुरक्षित, प्रगत आणि अभिमानास्पद अकोला घडवूया! 💙",

      senior_police_officers:
        '*👮‍♂ वरिष्ठ पोलीस अधिकारी👮‍♂*\n\n👮‍♂ श्री. अर्चित चांडक (आयपीएस)\nपोलीस अधीक्षक\n ☎ ०७२४२-४३५००२\n\n👮‍♂ श्री. बी. चंद्रकांत रेड्डी (आयपीएस)\nअपर पोलीस अधीक्षक\n ☎  ८८०६७०५४८०\n\n👮‍♂ श्री. निखिल पाटील (आयपीएस)(एएसपी)\nउपविभागीय पोलीस अधिकारी (अकोट विभाग)\n ☎ ८८८८५९३०६०\n\n👮‍♂ श्री. सुदर्शन पाटील\nउपविभागीय पोलीस अधिकारी (शहर विभाग)\n ☎ ९९२१३११८५८\n\n👮‍♂ श्री. गजानन पडघन\nउपविभागीय पोलीस अधिकारी (बाळापूर विभाग)\n ☎ ९९२२९१८१०२\n\n👮‍♀ सौ. वैशाली मुळे\nउपविभागीय पोलीस अधिकारी (मूर्तिजापूर विभाग)\n ☎ ८६६८३५२९६९\n\n💬 "प्रामाणिकपणे आणि निष्ठेने अकोल्याची सेवा व संरक्षण करण्यासाठी समर्पित."',
      history_akola_police:
        "📜 *अकोला पोलिसांचा इतिहास व संरचना* 🏛️\n\n⏳ *ऐतिहासिक पार्श्वभूमी:*\n- स्वातंत्र्यपूर्व काळात अकोला ब्रिटिश प्रशासनाखाली होते 🇬🇧 व ब्रिटिश पोलिस व्यवस्था येथे कार्यरत होती.\n- स्वातंत्र्यानंतर 🇮🇳 अकोला महाराष्ट्र पोलिस दलाचा भाग झाला 👮‍♂️.\n- अकोल्याचे पहिले पोलीस अधीक्षक *श्री. एस. एस. हरमन्सिंग (आय.पी.एस.)* यांची *८ ऑगस्ट १९४७* रोजी नियुक्ती झाली 🗓️.\n- आतापर्यंत ३१ अधीक्षकांनी जबाबदारीने सेवा बजावली आहे 👥.\n\n👮‍♂️ *सध्याची रचना:*\n- विद्यमान अधीक्षक: *श्री. श्री. अर्चित चांडक (आय.पी.एस.)* 🏢.\n- त्यांच्या अंतर्गत १ अतिरिक्त SP, ४ SDPO 🧑‍✈️, २३ पोलीस ठाणे 🚓 व विविध शाखा 🏢 कार्यरत आहेत.\n- ⚖️ कार्य: कायदा-सुव्यवस्था राखणे, गुन्हे तपासणे, नागरिकांची सुरक्षा व जनजागृती.\n- 💻 गुन्हे नियंत्रणासाठी आधुनिक तंत्रज्ञानाचा वापर.\n\n✨ अकोला पोलीस – सदैव जनसेवेत तत्पर. ✨",

      station_info:
        "तुम्ही {NAME} निवडले आहे. तपशील, इंचार्ज, संपर्क क्रमांक, ईमेल व Google Maps साठी अधिकृत संकेतस्थळ पहा: akolapolice.gov.in",

      // ===== पोलीस शाखा =====
      branch_control_room:
        '*अकोला पोलीस कंट्रोल रूम*\n\n📞 आपत्कालीन क्रमांक: 112\n📞 कंट्रोल रूम हेल्पलाइन: 0724-2435500\n📱 व्हॉट्सॲप: 88054 61100\n🔹 ट्विटर (X): https://x.com/akolapolice?lang=en\n🌐 वेबसाइट: https://www.akolapolice.gov.in/\n\n📍 स्थानाची माहिती:\n🔗 गूगल मॅप: https://maps.app.goo.gl/FhmpFbX3G4Vbn75u9\n\n"सद्गुणांचे संरक्षण करणे आणि वाईट नष्ट करणे!",',

      branch_lcb:
        '*लोकल क्राइम ब्रांच*\n\n👮‍♂ इन्चार्ज: पीआय शंकर शेडके\n📞 फोन: 9822966007\n📧 ईमेल: lcb.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/akolapolice?lang=en\n🌐 वेबसाइट: akolapolice.gov.in\n\n📍 स्थानाची माहिती:\n🔗 गूगल मॅप: https://www.google.com/maps/search/?api=1&query=Local+Crime+Branch+Akola\n\n"सद्गुणांचे संरक्षण करणे आणि वाईट नष्ट करणे!",',

      branch_cyber_cell:
        '*सायबर सेल*\n\n👮‍♂ इन्चार्ज: एपीआय मनीषा तायडे\n☎ दूरध्वनी: 0724-2445319\n📧 ईमेल: cybercell.akola@mahapolice.gov.in\n🔹 ट्विटर: https://x.com/cybercellakola?t=m1kUC1GWlQhjV0RXPPRb6w&s=08\n🌐 वेबसाइट: https://www.akolapolice.gov.in/\n\n📍 स्थानाची माहिती:\n🔗 गूगल मॅप: https://www.google.com/maps/search/?api=1&query=Special+Branch+Akola\n\n"सद्गुणांचे संरक्षण करणे आणि वाईट नष्ट करणे!",',

      branch_bharosa_cell:
        '*भरोसा सेल*\n\n👮‍♂ इन्चार्ज: एपीआय  चंद्रकला मेसरे\n📞 फोन: 9405213439\n📧 ईमेल: mahilakaksha.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/akolapolice?lang=en\n🌐 वेबसाइट: akolapolice.gov.in\n\n📍 स्थानाची माहिती:\n🔗 गूगल मॅप: https://www.google.com/maps/search/?api=1&query=Bharosa+Cell+Akola\n\n"सद्गुणांचे संरक्षण करणे आणि वाईट नष्ट करणे!",',

      branch_traffic:
        '*ट्रॅफिक शाखा*\n\n👮‍♂ इन्चार्ज: पीआय मनोज बहुरे\n📞 फोन: 7242435085\n📧 ईमेल: traffic.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/CTB_Akola?t=y8piXG5ZgviSHkNo1SKoGQ&s=09\n🌐 वेबसाइट: https://www.akolapolice.gov.in/\n\n📍 स्थानाची माहिती:\n🔗 गूगल मॅप: https://www.google.com/maps/search/?api=1&query=Traffic+Branch+Akola\n\n"सद्गुणांचे संरक्षण करणे आणि वाईट नष्ट करणे!",',

      branch_dsb:
        '🔒 *जिल्हा विशेष शाखा (DISTRICT SPECIAL BRANCH)*\n\n👮‍♂ प्रभारी अधिकारी: पो. नि. गजानन धंदर\n📞 दूरध्वनी: 9823236034\n📧 ईमेल: dsb.pol.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/akolapolice?lang=mr\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: https://maps.app.goo.gl/FhmpFbX3G4Vbn75u9\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      // ===== वेगवेगळे पोलीस ठाणे =====
      station_akot_file:
        '*अकोट फाईल पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: पो.नि. शेख रहीम शेख गफ्फार\n📞 दूरध्वनी: 8411937110\n📧 ईमेल: ps.akotfile.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/psakotfile\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a57af672773e0b260ea812\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=Akot+File+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_ramdaspeth:
        '*रामदासपेठ पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: पो.नि. शिरीष खंडारे\n📞 दूरध्वनी: 9764681906\n📧 ईमेल: ps.ramdaspeth.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/psramdaspeth\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a59fb672773e0b260eafb3\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=Ramdaspeth+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_city_kotwali:
        '*सिटी कोतवाली पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: पो.नि. संजय गवई\n📞 दूरध्वनी: 9552534796\n📧 ईमेल: ps.citykotwali.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/pscitykotwali\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a5910d72773e0b260eae10\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=City+Kotwali+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_old_city:
        '*जुने शहर पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: पो.नि. नितीन लेव्हरकर\n📞 दूरध्वनी: 9823939433\n📧 ईमेल: ps.oldcity.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/psoldcity\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a59cc372773e0b260eaf4d\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=Old+City+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_khadan:
        '*खदान पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: पो.नि. श्री. मनोज केदारे \n📞 दूरध्वनी: 9823723032\n📧 ईमेल: ps.khadan.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/pskhadan\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a5974672773e0b260eaed4\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=Khadan+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_civil_line:
        '*सिव्हिल लाईन पोलीस ठाणे*\n\n👮‍♀️ प्रभारी अधिकारी: पो.नि. श्रीमती. मालती कायटे\n📞 दूरध्वनी: 9823680782\n📧 ईमेल: ps.civilline.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/pscivilline\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a5958572773e0b260eae96\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=Civil+Line+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_midc:
        '*एम.आय.डी.सी. पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: स.पो.नि. राहुल जंजाळ\n📞 दूरध्वनी: 9850226873\n📧 ईमेल: ps.midc.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/psmidc\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a5981572773e0b260eaee8\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=MIDC+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_dabki_road:
        '*डाबकी रोड पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: पो.नि. दीपक कोळी\n📞 दूरध्वनी: 9850841789\n📧 ईमेल: ps.dabkiroad.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/psdabkiroad\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a594be72773e0b260eae72\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=Dabki+Road+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_akot_city:
        '*अकोट शहर पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: पो.नि. अमोल माळवे\n📞 दूरध्वनी: 8605117100\n📧 ईमेल: ps.akotcity.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/psakotcity\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a5738272773e0b260ea602\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=Akot+City+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_akot_rural:
        '*अकोट ग्रामीण पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: पो.नि. किशोर जुनघरे\n📞 दूरध्वनी: 8805987458\n📧 ईमेल: ps.akotrural.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/psakotrural\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a57d4572773e0b260ea89a\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=Akot+Rural+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_dahihanda:
        '*दहिहांडा पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: स.पो.नि. गोपाल ढोले\n📞 दूरध्वनी: 9604364406\n📧 ईमेल: ps.dahihanda.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/psdahihanda\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a5958572773e0b260eae96\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=Dahihanda+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_telhara:
        '*तेल्हारा पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: पो.नि. प्रकाश तुनकलवार\n📞 दूरध्वनी: 8975753516\n📧 ईमेल: ps.telhara.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/pstelhara\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a5a12472773e0b260eaffc\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=Telhara+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_hiwarkhed:
        '*हिवरखेड पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: स.पो.नि. गजानन राठोड\n📞 दूरध्वनी: 9822878821\n📧 ईमेल: ps.hiwarkhed.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/pshiwarkhed\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a5966372773e0b260eaea3\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=Hiwarkhed+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_balapur:
        '*बाळापूर पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: पो.नि. प्रकाश झोडगे\n📞 दूरध्वनी: 9657009727\n📧 ईमेल: ps.balapur.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/psbalapur\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a583b972773e0b260eaacb\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=Balapur+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_ural:
        '*उरळ पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: स.पो.नि. पंकज कांबळे\n📞 दूरध्वनी: 7972048513\n📧 ईमेल: ps.ural.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/psural\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a5a1ea72773e0b260eb054\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=Ural+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_channi:
        '*चान्नी पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: स.पो.नि. रविंद्र लांडे\n📞 दूरध्वनी: 8108580999\n📧 ईमेल: ps.channi.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/pschanni\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a58fbd72773e0b260eadec\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=Channi+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_patur:
        '*पातूर पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: पो.नि. हनुमंत डोपेवाड\n📞 दूरध्वनी: 8424972277\n📧 ईमेल: ps.patur.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/pspatur\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a59d6372773e0b260eaf51\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=Patur+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_murtijapur_city:
        '*मुर्तिजापूर शहर पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: पो.नि. अजित जाधव\n📞 दूरध्वनी: 9823308230\n📧 ईमेल: ps.murtizapurcity.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/psmurtizapurcity\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a599aa72773e0b260eaef0\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=Murtijapur+City+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_murtijapur_rural:
        '*मुर्तिजापूर ग्रामीण पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: स.पो.नि. श्रीधर गुठ्ठे\n📞 दूरध्वनी: 9850394342\n📧 ईमेल: ps.murtizapurrural.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/psmurtizapurrural\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a59b6072773e0b260eaf11\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=Murtijapur+Rural+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_mana:
        '*माना पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: स.पो.नि. गणेश नावकार\n📞 दूरध्वनी: 7570552954\n📧 ईमेल: ps.mana.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/psmana\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=Mana+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_barshitakli:
        '*बार्शिटाकळी पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: पो.नि प्रवीण धुमाळ\n📞 दूरध्वनी: 9850373620\n📧 ईमेल: ps.barshitakli.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/psbarshitakli\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a5850a72773e0b260eaaf7\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=Barshitakli+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_pinjar:
        '*पिंजर पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: स.पो.नि. गंगाधर दराडे\n📞 दूरध्वनी: 9923416668\n📧 ईमेल: ps.pinjar.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/pspinjar\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a59e9272773e0b260eaf85\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=Pinjar+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      station_borgaon_manju:
        '*बोरगाव मंजू पोलीस ठाणे*\n\n👮‍♂ प्रभारी अधिकारी: पो.नि. अनिल गोपाळ\n📞 दूरध्वनी: 9881866768\n📧 ईमेल: ps.borgaonmanju.akola@mahapolice.gov.in\n🔹 ट्विटर (X): https://x.com/psborgaonmanju\n🌐 संकेतस्थळ: https://www.akolapolice.gov.in/police-station/67a58e6c72773e0b260ead9d\n\n📍 ठिकाणाची माहिती:\n🔗 Google नकाशा: http://www.google.com/maps/search/?api=1&query=Borgaon+Manju+Police+Station+Akola\n\n"सद्गुणांचे रक्षण आणि दुर्जनांचा विनाश हीच आमची ओळख!"',

      // नागरिक सेवा (७)
      dsb_service_1:
        "🌍 *परदेशी NOC* \n\nपरदेशी नागरिकांना भारतात वास्तव्य, शिक्षण, नोकरी किंवा इतर कारणांसाठी आवश्यक NOC जिल्हा विशेष शाखेमार्फत दिली जाते.\n\n🔗 या सेवेचा उपयोग करण्यासाठी URL निवडा आणि ID तयार करा.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      dsb_service_2:
        "🛂 *पोलिस क्लिअरन्स प्रमाणपत्र (PCC)* \n\nनोकरी, व्हिसा, परदेश प्रवास किंवा परदेशात वास्तव्य करण्यासाठी पोलिस क्लिअरन्स प्रमाणपत्र आवश्यक असते.\n\n🔗 या सेवेचा उपयोग करण्यासाठी URL निवडा आणि ID तयार करा.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      dsb_service_3:
        "📑 *प्रस्ताव भारत सरकारकडे* \n\nपरदेशी नागरिकांशी संबंधित विविध प्रस्ताव जिल्हा विशेष शाखेमार्फत भारत सरकारकडे पाठवले जातात.\n\n🔗 या सेवेचा उपयोग करण्यासाठी URL निवडा आणि ID तयार करा.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      dsb_service_4:
        "🕒 *वास्तव्य वाढवणे* \n\nपरदेशी नागरिकांना भारतातील वास्तव्याचा कालावधी वाढवण्यासाठी जिल्हा विशेष शाखेमार्फत अर्ज करता येतो.\n\n🔗 या सेवेचा उपयोग करण्यासाठी URL निवडा आणि ID तयार करा.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      dsb_service_5:
        "🔙 *परत येण्यासाठी NOC* \n\nभारतामध्ये परत येणाऱ्या नागरिकांना आवश्यक त्या प्रमाणपत्रांची पूर्तता करून NOC दिले जाते.\n\n🔗 या सेवेचा उपयोग करण्यासाठी URL निवडा आणि ID तयार करा.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      dsb_service_6:
        "💼 *नोकरी NOC* \n\nपरदेशी नागरिकांना भारतात नोकरीसाठी आवश्यक असलेले NOC जिल्हा विशेष शाखेमार्फत दिले जाते.\n\n🔗 या सेवेचा उपयोग करण्यासाठी URL निवडा आणि ID तयार करा.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      dsb_service_7:
        "✈️ *प्रवासासाठी PCC* \n\nपरदेश प्रवासासाठी नागरिकांना पोलिस क्लिअरन्स प्रमाणपत्र दिले जाते.\n\n🔗 या सेवेचा उपयोग करण्यासाठी URL निवडा आणि ID तयार करा.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      dsb_service_8:
        "🌏 *तिबेटियन NOC* \n\nभारतामध्ये राहणाऱ्या तिबेटियन नागरिकांसाठी विशेष NOC जिल्हा विशेष शाखेमार्फत दिले जाते.\n\n🔗 या सेवेचा उपयोग करण्यासाठी URL निवडा आणि ID तयार करा.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      // RTS सेवा (८)
      ob_service_1:
        "🎭 *कलाकार परवानगी* \n\nपरदेशी कलाकारांना भारतात कार्यक्रम सादर करण्यासाठी आवश्यक परवानगी दिली जाते.\n\n🔗 या सेवेचा उपयोग करण्यासाठी URL निवडा आणि ID तयार करा.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      ob_service_2:
        "📜 *कागदपत्र सत्यापन* \n\nविविध अधिकृत कागदपत्रांचे सत्यापन व प्रमाणिकरण करण्याची सेवा उपलब्ध आहे.\n\n🔗 या सेवेचा उपयोग करण्यासाठी URL निवडा आणि ID तयार करा.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      ob_service_3:
        "📄 *FIR प्रत* \n\nनागरिकांना नोंदवलेल्या गुन्ह्याची *पहिल्या माहिती अहवालाची (FIR)* प्रमाणित प्रत उपलब्ध करून दिली जाते.\n\n🔗 या सेवेचा उपयोग करण्यासाठी URL निवडा आणि ID तयार करा.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      ob_service_4:
        "🔊 *लाउडस्पीकर परवाना* \n\nसार्वजनिक कार्यक्रम, सभा किंवा धार्मिक कार्यासाठी लाउडस्पीकर वापरण्याची परवानगी दिली जाते.\n\n🔗 या सेवेचा उपयोग करण्यासाठी URL निवडा आणि ID तयार करा.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      ob_service_5:
        "🎶 *कार्यक्रम NOC* \n\nमनोरंजन, सांस्कृतिक किंवा इतर कार्यक्रम आयोजित करण्यासाठी NOC आवश्यक असते.\n\n🔗 या सेवेचा उपयोग करण्यासाठी URL निवडा आणि ID तयार करा.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      ob_service_6:
        "📢 *सभा व मिरवणूक परवानगी* \n\nसभा, मोर्चे किंवा मिरवणुकींसाठी कायदेशीर परवानगी दिली जाते.\n\n🔗 या सेवेचा उपयोग करण्यासाठी URL निवडा आणि ID तयार करा.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      ob_service_7:
        "🏪 *व्यवसाय NOC* \n\nपेट्रोल पंप, हॉटेल, बार, लॉज इत्यादी व्यवसाय सुरू करण्यासाठी NOC दिले जाते.\n\n🔗 या सेवेचा उपयोग करण्यासाठी URL निवडा आणि ID तयार करा.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      ob_service_8:
        "🔫 *शस्त्र परवाना NOC* \n\nशस्त्र परवाना मिळवण्यासाठी किंवा नूतनीकरणासाठी आवश्यक NOC दिले जाते.\n\n🔗 या सेवेचा उपयोग करण्यासाठी URL निवडा आणि ID तयार करा.\n👉 https://aaplesarkar.mahaonline.gov.in/en/Registration/Register",

      event_navratri:
        "📢 *अकोला पोलीस जनजागृती संदेश* 🗳️\n\n🇮🇳 *लोकशाहीचा उत्सव शांततेत आणि जबाबदारीने साजरा करा!*\n\n✅ जबाबदारीने मतदान करा – हा तुमचा हक्क आहे.\n🚫 अफवा पसरवू नका किंवा चुकीची माहिती शेअर करू नका.\n💬 सोशल मीडियावर संयम ठेवा आणि कायद्याचे पालन करा.\n👀 संशयास्पद हालचाल, अनधिकृत प्रचार किंवा वाद निर्माण करणारी कृती दिसल्यास त्वरित पोलिसांना कळवा.\n\n👮‍♂ *अकोला पोलीस – तुमच्या सुरक्षेसाठी सदैव तत्पर!* 🚔\n📞 *आपत्कालीन क्रमांक:* 112\n\n🕊 *शांततेत मतदान करा, लोकशाही मजबूत करा आणि सुव्यवस्था राखा!*",
      event_prahar:
        "🟢 ऑपरेशन प्रहार अपडेट\n\n📅 २५/०५/२०२५ – ३१/१०/२०२५\n\n🚔 प्रमुख कारवाई:\n🌿 NDPS कायदा: ११ प्रकरणे | ₹२,२३,५५०\n🔫 शस्त्र कायदा: १२३ प्रकरणे | ₹१२,५५,१००\n🐄 प्राणी संरक्षण: ५१ प्रकरणे | ₹१,९८,२८,८१६\n💊 ESC कायदा: ११ प्रकरणे | ₹१५,७९,४६६\n🚬 गुटखा कायदा: ८२७ प्रकरणे | ₹५४,०४,९९७\n🍾 मद्य कायदा: ४६५ प्रकरणे | ₹४१,६८,६७६\n🎲 जुगार कायदा: १९ प्रकरणे | ₹३,५२,१३,६१२\n\n💰 एकूण: १५०७ प्रकरणे | ₹३.५२ कोटी जप्त\n\n⚖ कायदेशीर कारवाई:\n🧾 MPDA – १२\n📜 MCOCA – १०\n🔹 ५५/५६ कलम – १४\n\n🐂 जप्त माहिती:\n🐄 वाचवलेले जनावरे – १९६\n🥩 गोमांस – २५४३ किलो\n🚗 वाहने – ३७\n🧑🏻‍🦱 आरोपी – १२०\n\n🔥 ऑपरेशन प्रहार टीमचे उत्तम कार्य! 💪",
      event_udan:
        "🌍 जागतिक अंमली पदार्थविरोधी दिनानिमित्त अकोला जिल्हा पोलिसांतर्फे *MISSION उडान – व्यसनमुक्तीची संकल्प मोहीम* 🚭✨ राबविण्यात आली आहे. 'मिशन उडान' ही अकोला पोलिसांची प्रशंसनीय मोहीम आहे 👮‍♂️💙. अधिक माहितीसाठी भेट द्या 🔗 https://akolapolice.gov.in/initiatives",
      event_raksha_qr:
        "🛡️ *रक्षा उपक्रमाबाबत अभिप्राय* 📝\n\nअकोला पोलिसांचा हा आगळावेगळा सुरक्षा प्रकल्प अत्यंत उपयुक्त ठरत आहे.\n\n✅ त्वरित पोलिस मदत मिळते.\n✅ महिला, ज्येष्ठ नागरिक आणि विद्यार्थ्यांसाठी विशेषतः फायदेशीर.\n✅ सार्वजनिक ठिकाणे व संस्थांमध्ये सहज उपलब्ध.\n\n🚔 हा उपक्रम जलद, विश्वासार्ह आणि खऱ्या अर्थाने नागरिकाभिमुख आहे!\n\n👉 *आपला अभिप्राय नोंदविण्यासाठी येथे क्लिक करा:* https://www.sevapolice.co.in/AkolaDist/user/ps_sp_office.php",
    },
    invalidInput:
      "❌ चुकीची निवड. कृपया दिलेल्या पर्यायांमधून निवडा किंवा 'menu' टाईप करून पुन्हा सुरू करा,\n🚨आपत्कालीन संपर्क : 112",
  },
};

// ================== Session Management ==================
async function getUserSession(phoneNumber) {
  try {
    let session = await UserSession.findOne({ phoneNumber });
    if (!session) {
      session = new UserSession({
        phoneNumber,
        language: null,
        currentMenu: "language_selection",
        previousMenu: null,
        userName: "",
        awaitingInput: null,
      });
      await session.save();
    }
    return session;
  } catch (err) {
    console.error("Error getting user session:", err);
    return null;
  }
}

async function updateUserSession(phoneNumber, updates) {
  try {
    await UserSession.findOneAndUpdate(
      { phoneNumber },
      { ...updates, lastInteraction: new Date() },
      { upsert: true }
    );
  } catch (err) {
    console.error("Error updating user session:", err);
  }
}

// ================== Flow Handler Functions ==================
async function sendMainMenu(to, lang) {
  const t = textContent[lang || "en"].mainMenu;
  await updateUserSession(to, { currentMenu: "main_menu", previousMenu: null });
  await sendListMessage(to, t.header, t.body, t.buttonText, t.sections);
}

// ================== Webhook Verification ==================
router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode &&
    token &&
    mode === "subscribe" &&
    token === process.env.VERIFY_TOKEN
  ) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  }
  console.log("❌ Webhook verification failed");
  res.sendStatus(403);
});

// ================== Menu Handlers ==================
const menuHandlers = {
  main_menu: (to, lang) => sendMainMenu(to, lang),
  our_services_menu: (to, lang) => {
    const t = textContent[lang];
    sendListMessage(
      to,
      t.ourServicesMenu.header,
      t.ourServicesMenu.body,
      t.ourServicesMenu.buttonText,
      t.ourServicesMenu.sections
    );
  },
  major_services_menu: (to, lang) => {
    const t = textContent[lang];
    sendListMessage(
      to,
      t.majorServicesMenu.header,
      t.majorServicesMenu.body,
      t.majorServicesMenu.buttonText,
      t.majorServicesMenu.sections
    );
  },
  districtSpecialBranchMenu: (to, lang) => {
    const t = textContent[lang];
    sendListMessage(
      to,
      t.districtSpecialBranchMenu.header,
      t.districtSpecialBranchMenu.body,
      t.districtSpecialBranchMenu.buttonText,
      t.districtSpecialBranchMenu.sections
    );
  },
  otherBranchesMenu: (to, lang) => {
    const t = textContent[lang];
    sendListMessage(
      to,
      t.otherBranchesMenu.header,
      t.otherBranchesMenu.body,
      t.otherBranchesMenu.buttonText,
      t.otherBranchesMenu.sections
    );
  },
  event_intimation_menu: (to, lang) => {
    const t = textContent[lang];
    sendListMessage(
      to,
      t.eventIntimationMenu.header,
      t.eventIntimationMenu.body,
      t.eventIntimationMenu.buttonText,
      t.eventIntimationMenu.sections
    );
  },
  cyber_issues_menu: (to, lang) => {
    const t = textContent[lang];
    sendListMessage(
      to,
      t.cyberIssuesMenu.header,
      t.cyberIssuesMenu.body,
      t.cyberIssuesMenu.buttonText,
      t.cyberIssuesMenu.sections
    );
  },
  know_akola_police_menu: (to, lang) => {
    const t = textContent[lang];
    sendListMessage(
      to,
      t.knowAkolaPoliceMenu.header,
      t.knowAkolaPoliceMenu.body,
      t.knowAkolaPoliceMenu.buttonText,
      t.knowAkolaPoliceMenu.sections
    );
  },
  police_stations_branches_menu: (to, lang) => {
    const t = textContent[lang];
    sendListMessage(
      to,
      t.policeStationsBranchesMenu.header,
      t.policeStationsBranchesMenu.body,
      t.policeStationsBranchesMenu.buttonText,
      t.policeStationsBranchesMenu.sections
    );
  },
  city_division_stations: (to, lang) => {
    const t = textContent[lang];
    sendListMessage(
      to,
      t.cityDivisionStations.header,
      t.cityDivisionStations.body,
      t.cityDivisionStations.buttonText,
      t.cityDivisionStations.sections
    );
  },
  akot_division_stations: (to, lang) => {
    const t = textContent[lang];
    sendListMessage(
      to,
      t.akotDivisionStations.header,
      t.akotDivisionStations.body,
      t.akotDivisionStations.buttonText,
      t.akotDivisionStations.sections
    );
  },
  balapur_division_stations: (to, lang) => {
    const t = textContent[lang];
    sendListMessage(
      to,
      t.balapurDivisionStations.header,
      t.balapurDivisionStations.body,
      t.balapurDivisionStations.buttonText,
      t.balapurDivisionStations.sections
    );
  },
  murtijapur_division_stations: (to, lang) => {
    const t = textContent[lang];
    sendListMessage(
      to,
      t.murtijapurDivisionStations.header,
      t.murtijapurDivisionStations.body,
      t.murtijapurDivisionStations.buttonText,
      t.murtijapurDivisionStations.sections
    );
  },
};

// ================== Main Webhook Handler ==================
router.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry;
    if (!entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      return res.sendStatus(200);
    }

    const msg = entry[0].changes[0].value.messages[0];
    const from = msg.from;
    const profileName =
      entry[0].changes[0].value.contacts?.[0]?.profile?.name || "";

    let userMsg = "";
    let msgId = "";
    let originalTitle = "";

    if (msg.type === "text") {
      userMsg = msg.text.body.toLowerCase().trim();
      originalTitle = msg.text.body;
    } else if (msg.type === "interactive") {
      const interactive = msg.interactive;
      if (interactive.type === "button_reply") {
        msgId = interactive.button_reply.id;
        originalTitle = interactive.button_reply.title;
      } else if (interactive.type === "list_reply") {
        msgId = interactive.list_reply.id;
        originalTitle = interactive.list_reply.title;
      }
      userMsg = (originalTitle || "").toLowerCase();
    } else {
      return res.sendStatus(200);
    }

    console.log(
      `📩 Message from ${from} (${profileName}): "${originalTitle}" (ID: ${msgId})`
    );

    const session = await getUserSession(from);
    if (!session) return res.sendStatus(500);

    if (!session.userName && profileName) {
      await updateUserSession(from, { userName: profileName });
    }

    await logConversation(
      from,
      originalTitle,
      "user",
      session.language || "en",
      profileName
    );

    if (["hi", "hello", "start", "menu", "restart"].includes(userMsg)) {
      await updateUserSession(from, {
        currentMenu: "language_selection",
        previousMenu: null,
        awaitingInput: null,
        language: null,
      });
      const t = textContent.en;
      await sendQuickReply(from, t.welcome, t.language_buttons);
      return res.sendStatus(200);
    }

    if (session.awaitingInput) {
      if (session.awaitingInput === "track_complaint") {
        // ✅ ensure scope
        const t = textContent[session.language] || textContent["en"];

        const rawInput = originalTitle?.trim() || userMsg;
        let normalized = rawInput.replace(/[\s-]/g, "");

        const phoneRegex = /^(?:\+91|0)?[6-9]\d{9}$/;
        if (!phoneRegex.test(normalized)) {
          await sendTextMessage(from, t.infoTexts.track_complaint_invalid);
          return res.sendStatus(200);
        }

        if (normalized.startsWith("+91")) normalized = normalized.slice(3);
        if (normalized.startsWith("0")) normalized = normalized.slice(1);

        const finalPhone = normalized;
        const trackingUrl = `https://www.sevapolice.co.in/AkolaDist/user/chatbot_records.php?mob=${encodeURIComponent(
          finalPhone
        )}`;

        // ✅ Send tracking info with navigation buttons
        await sendQuickReply(
          from,
          `${t.infoTexts.track_complaint_success}\n\n🔗 ${trackingUrl}\n\n📱 Tap the link to view your complaint status.`,
          [
            { id: "back_to_previous", title: t.navigation.previous },
            { id: "back_to_main", title: t.navigation.main },
          ]
        );

        // ✅ clear input state (don’t auto send main menu)
        await updateUserSession(from, { awaitingInput: null });
        return res.sendStatus(200);
      }

      return res.sendStatus(200);
    }

    const lang = session.language || "en";
    const t = textContent[lang];

    if (msgId?.startsWith("station_") || msgId?.startsWith("branch_")) {
      let infoText =
        t.infoTexts[msgId] ||
        `📌 Details for *${originalTitle}* are not available right now.`;
      await sendInfoWithButtons(from, infoText, lang);
      return res.sendStatus(200);
    }
    
  } // <- track complaint closes here
}

  return res.sendStatus(200);

} // <- session.awaitingInput closes here

    switch (msgId) {
      case "back_to_previous":
        const targetMenu = session.currentMenu || "main_menu";

        if (menuHandlers[targetMenu]) {
          await menuHandlers[targetMenu](from, lang);
        } else {
          await sendMainMenu(from, lang);
        }
        break;

      // <-- ADDED: A dedicated case for "back_to_main" to prevent language selection.
      case "back_to_main":
        await sendMainMenu(from, lang);
        break;

      case "lang_en":
        await updateUserSession(from, { language: "en" });
        await sendMainMenu(from, "en");
        break;
      case "lang_mr":
        await updateUserSession(from, { language: "mr" });
        await sendMainMenu(from, "mr");
        break;

      // Menu Navigation Cases
      case "our_services":
        await updateUserSession(from, {
          previousMenu: session.currentMenu,
          currentMenu: "our_services_menu",
        });
        await menuHandlers.our_services_menu(from, lang);
        break;
      case "major_services":
        await updateUserSession(from, {
          previousMenu: session.currentMenu,
          currentMenu: "major_services_menu",
        });
        await menuHandlers.major_services_menu(from, lang);
        break;
      case "district_special_branch":
        await updateUserSession(from, {
          previousMenu: session.currentMenu,
          currentMenu: "districtSpecialBranchMenu",
        });
        await menuHandlers.districtSpecialBranchMenu(from, lang);
        break;
      case "other_branches":
        await updateUserSession(from, {
          previousMenu: session.currentMenu,
          currentMenu: "otherBranchesMenu",
        });
        await menuHandlers.otherBranchesMenu(from, lang);
        break;
      case "event_intimation":
        await updateUserSession(from, {
          previousMenu: session.currentMenu,
          currentMenu: "event_intimation_menu",
        });
        await menuHandlers.event_intimation_menu(from, lang);
        break;
      case "cyber_issues":
        await updateUserSession(from, {
          previousMenu: session.currentMenu,
          currentMenu: "cyber_issues_menu",
        });
        await menuHandlers.cyber_issues_menu(from, lang);
        break;
      case "know_akola_police":
        await updateUserSession(from, {
          previousMenu: session.currentMenu,
          currentMenu: "know_akola_police_menu",
        });
        await menuHandlers.know_akola_police_menu(from, lang);
        break;
      case "police_stations_branches":
        await updateUserSession(from, {
          previousMenu: session.currentMenu,
          currentMenu: "police_stations_branches_menu",
        });
        await menuHandlers.police_stations_branches_menu(from, lang);
        break;
      case "city_division":
        await updateUserSession(from, {
          previousMenu: session.currentMenu,
          currentMenu: "city_division_stations",
        });
        await menuHandlers.city_division_stations(from, lang);
        break;
      case "akot_division":
        await updateUserSession(from, {
          previousMenu: session.currentMenu,
          currentMenu: "akot_division_stations",
        });
        await menuHandlers.akot_division_stations(from, lang);
        break;
      case "balapur_division":
        await updateUserSession(from, {
          previousMenu: session.currentMenu,
          currentMenu: "balapur_division_stations",
        });
        await menuHandlers.balapur_division_stations(from, lang);
        break;
      case "murtijapur_division":
        await updateUserSession(from, {
          previousMenu: session.currentMenu,
          currentMenu: "murtijapur_division_stations",
        });
        await menuHandlers.murtijapur_division_stations(from, lang);
        break;

      // Informational Cases (now use the new button function)
      case "emergency_contacts":
      case "complaint_register":
      case "public_awareness":
      case "citizen_responsibility":
      case "passport_info":
      case "police_verification_info":
      case "traffic_service_info":
      case "whatsapp_channel_info":
      case "dsb_service_1":
      case "dsb_service_2":
      case "dsb_service_3":
      case "dsb_service_4":
      case "dsb_service_5":
      case "dsb_service_6":
      case "dsb_service_7":
      case "dsb_service_8":
      case "ob_service_1":
      case "ob_service_2":
      case "ob_service_3":
      case "ob_service_4":
      case "ob_service_5":
      case "ob_service_6":
      case "ob_service_7":
      case "ob_service_8":
      case "event_navratri":
      case "event_prahar":
      case "event_udan":
      case "event_raksha_qr":
      case "victim_of_cybercrime":
      case "lost_stolen_mobile":
      case "social_media_hacked":
      case "online_financial_fraud":
      case "cyber_volunteer":
      case "bank_account_hold":
      case "sanchar_saathi":
      case "senior_police_officers":
      case "history_akola_police":
        await sendInfoWithButtons(from, t.infoTexts[msgId], lang);
        break;

      // Special Case for complaint tracking
      case "track_complaint":
        // Ask user to provide phone number
        await updateUserSession(from, { awaitingInput: "track_complaint" });
        await sendTextMessage(from, t.infoTexts.track_complaint);
        break;

      default:
        if (!session.language) {
          await sendTextMessage(from, textContent.en.invalidInput);
          await updateUserSession(from, { currentMenu: "language_selection" });
          await sendQuickReply(
            from,
            textContent.en.welcome,
            textContent.en.language_buttons
          );
        } else {
          await sendTextMessage(from, t.invalidInput);
          await sendMainMenu(from, lang);
        }
        break;
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.sendStatus(500);
  }
});

// ================== Root Endpoint ==================
router.get("/", (req, res) => {
  res.json({
    status: "🟢 Active",
    service: "Akola Police Cybercell WhatsApp Bot",
    version: "6.4 - Navigation Fixed", // <-- MODIFIED
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
