# The YoCV QR check: demo for GenU

GenU asked to see an informal employer scan a QR code to check a young person's CV. This page shows how to see it, either in a short video or by running it on a laptop and a phone.

Everything in it is sample data: Halima Yusuf is the fictional person the four BBS prototypes share. The prototype is a student concept. Not operated by Yoma or UNICEF.

## What the demo shows

1. Halima builds her CV in YoCV from her Yo-ID record. Her solar credentials, including the **Skill Credential** `cred-002` from SkillLens, are marked **Confirmed from Yoma**. Her phone repair work at her aunt's market stall is in her own words and marked **Self-declared**.
2. In Step 4 she makes **a QR code for employers**. It goes on the printed CV, and **Show it on my phone** puts it full screen on her own phone.
3. The employer at Sunrise Solar Ltd points their phone camera at it. Their phone opens the **CV check** page, with no app and no account. The page groups every line by who confirmed it: Confirmed from Yoma, Vouched, and Self-declared. It shows the check code, which matches the CV, and the date the check ends. It never shows Halima's phone, email or town.
4. Halima applies to the **Solar Installation Assistant (Trainee)** job with her CV and its check link. This is a mock-up, and nothing is sent. The check and the **Job Application** `app-001` are listed under **On your Yo-ID**, a mocked write.
5. She can **withdraw** the check. The employer's page then says she withdrew it and shows nothing else.

## The video

To add: a 60 to 90 second phone recording of steps 2, 3 and 5.

## Run it yourself (about 5 minutes)

You need Node 20 or later, and a laptop and a phone on the same Wi-Fi. No keys are needed. Without a model key, the CV lines come from templates, and Yoma's public data is still read live.

1. Get the code:
   ```sh
   git clone https://github.com/greenglow7/yocv-prototype.git
   cd yocv-prototype
   ```
2. Find the laptop's address on the Wi-Fi. On a Mac, run `ipconfig getifaddr en0`. On Windows, run `ipconfig` and read the IPv4 address. Below it is `192.168.1.20`.
3. Start the server so the phone can reach it:
   ```sh
   HOST=0.0.0.0 YOCARD_PUBLIC_URL=http://192.168.1.20:4173 YOVOUCH_SIM=1 npm start
   ```
4. On the laptop, open `http://192.168.1.20:4173/?as=halima#/cv`. Tick her record, choose **Solar installation assistant** and add her work: "Phone repair and sales" at Kaduna Central Market. Accept the lines and skills, then **Continue to your CV**.
5. Click **Make a QR code for employers**, then **Show it on my phone**.
6. Scan the QR with the phone's camera and open the link.
7. Back on the laptop, click **Withdraw this check**, then reload the page on the phone.

`presentation/demo-script.md` has the full six-minute demo, beat by beat.

## What is real and what is mocked

| Part | State |
| --- | --- |
| The signed check behind the QR, its end date and its withdrawal | Real, in the prototype. It is signed with the prototype's own key, not Yoma's. |
| The phone scan | Real. Tested with a phone camera over Wi-Fi on 2026-11-25. |
| Halima's Yoma record | Fictional sample data in Yoma's format. Yoma's skill names are read live. |
| The CV lines | Template wording without a model key. With a key, a model writes them, and code checks every line against her answers. |
| The application and the Yo-ID record | Mock-ups. Nothing is sent, and nothing is written to Yoma. |

## In Yoma

The check would be signed with Yoma's key, written to the person's YoID, and shared from the YoID mobile wallet's own QR screen. `docs/superpowers/specs/2026-11-27-yocv-phone-show-design.md` sets out how YoCV's pieces map onto the Liquid Thought YoID mobile prototype.
