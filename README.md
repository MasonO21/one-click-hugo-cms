# Hugo template for Netlify CMS with Netlify Identity

This is a small business template built with [Victor Hugo](https://github.com/netlify/victor-hugo) and [Netlify CMS](https://github.com/netlify/netlify-cms), designed and developed by [Darin Dimitroff](http://www.darindimitroff.com/), [spacefarm.digital](https://www.spacefarm.digital).

## Getting started

Use our deploy button to get your own copy of the repository. 

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/netlify-templates/one-click-hugo-cms&stack=cms)

This will setup everything needed for running the CMS:

* A new repository in your GitHub account with the code
* Full Continuous Deployment to Netlify's global CDN network
* Control users and access with Netlify Identity
* Manage content with Netlify CMS

Once the initial build finishes, you can invite yourself as a user. Go to the Identity tab in your new site, click "Invite" and send yourself an invite.

Now you're all set, and you can start editing content!

## Local Development

Clone this repository, and run `yarn` or `npm install` from the new folder to install all required dependencies.

Then start the development server with `yarn start` or `npm start`.

## Layouts

The template is based on small, content-agnostic partials that can be mixed and matched. The pre-built pages showcase just a few of the possible combinations. Refer to the `site/layouts/partials` folder for all available partials.

Use Hugo’s `dict` functionality to feed content into partials and avoid repeating yourself and creating discrepancies.

## CSS

The template uses a custom fork of Tachyons and PostCSS with cssnext and cssnano. To customize the template for your brand, refer to `src/css/imports/_variables.css` where most of the important global variables like colors and spacing are stored.

## SVG

All SVG icons stored in `site/static/img/icons` are automatically optimized with SVGO (gulp-svgmin) and concatenated into a single SVG sprite stored as a a partial called `svg.html`. Make sure you use consistent icons in terms of viewport and art direction for optimal results. Refer to an SVG via the `<use>` tag like so:

```
<svg width="16px" height="16px" class="db">
  <use xlink:href="#SVG-ID"></use>
</svg>
```

## Ghost Mode for Kids

`site/static/ghost-mode/` holds Ghost Mode for Kids, a prototype parental-safety app served at `/ghost-mode/`. The kid's phone checks texts, email and social apps (Instagram, TikTok, Snapchat, Discord, Roblox, WhatsApp, Minecraft) for warning patterns on the device, and parents get pattern alerts instead of the messages themselves: new adult contacts, busy late nights, grooming warning signs, scams and fake links, bullying, signs of distress (with 988 crisis-line resources), and live location shared with someone new.

* `index.html` is the whole app: HTML, CSS and JavaScript in one file. The detection engine is the section that starts at `const SENS=`.
* `manifest.webmanifest`, `sw.js` and the PNG icons make it installable on phones ("Add to Home Screen") and let it open offline.
* One account covers up to 5 kids. Each kid has their own phone, alerts and age-based settings.
* Each child's phone is set to iPhone or Android. Android gets everything above. On iPhone, Apple keeps texts and other apps' messages private, so Ghost Mode checks email, late-night screen time (in minutes), fake websites when tapped, and, if the child turns on the Ghost Mode keyboard, what they type. Texts can be checked overnight by an optional home-computer sync, social apps and games can be paused during quiet hours, and a checklist walks parents through each app's own parent tools. Scenarios Apple keeps private show "Not seen on iPhone". `docs/ghost-mode-ios.md` is the plan for building the real iPhone app.
* Parents choose which alerts pop up on their phone. During quiet time only "Act today" alerts come through; the rest wait for a morning roundup.
* The app is in English and Spanish (switch in the header or Settings), and detection works on English and Spanish messages either way. All app text goes through `L()`, with English as the key; the Spanish strings are in the `DICT.es` block. Another language is one more entry in `LANGS` and `DICT`.
* The distress and bullying wording, and the advice shown to parents, should be reviewed by child-safety and mental-health professionals before launch.
* Pricing is $9.99 a month or $99 a year for one child, or $14.99 a month for up to 5 kids, each with a free first week. The plan screens are UI only: no payment details are collected. Connect a payment provider (for example Stripe) before charging anyone.
* `yarn test:ghost-mode` (or `node tests/ghost-mode/engine.test.js`) checks the detection engine against sample messages, including disguised spellings and everyday phrases that must not trigger alerts.
