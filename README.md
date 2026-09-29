# Trail Notes

**Trail Notes** is a voice-first journaling app for hikers and runners.

* [`mobile/`](mobile/): the iPhone and Android app (Expo, React Native). See its [README](mobile/README.md) and [launch checklist](mobile/store/CHECKLIST.md)
* The rest of this repository: the marketing website, built on the Hugo + Netlify CMS template described below

## Website

* **Home** (`site/content/_index.md`): hero with waitlist signup, how it works, example entry, Plus teaser
* **Features** (`site/content/features/_index.md`): free and Plus features, plus the pricing table. Prices are placeholders, so edit them before launch
* **Journal** (`site/content/post/`): blog posts
* **Contact** (`site/content/contact/_index.md`) and a **Thanks** page shown after either form is submitted
* **Privacy** (`site/content/privacy.md`): describes what this website collects. It does not cover the app. Have it reviewed and update it if you add analytics, change form handling, or launch the app
* **App privacy** (`site/content/app-privacy.md`): the privacy policy for the mobile app in [`mobile/`](mobile/). The stores need this URL
* **Waitlist and contact forms** use [Netlify Forms](https://docs.netlify.com/forms/setup/). Submissions appear in the Forms tab of your Netlify site after the first deploy
* All pages are editable in Netlify CMS at `/admin/`

## Deploying

`netlify.toml` passes each deploy's address to Hugo through `HUGO_BASEURL`, so canonical links, social preview images, `sitemap.xml` and `robots.txt` use the real URL. Without it (for example a local `yarn build`), those tags are left out rather than written with a wrong address.

The site uses no analytics or tracking. Nunito Sans is self-hosted from `src/fonts` under the SIL Open Font License (`src/fonts/OFL.txt`).

---

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
