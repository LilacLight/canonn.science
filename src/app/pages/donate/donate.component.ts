import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Standalone /donate page (not an article). */
@Component({
  selector: 'app-donate',
  standalone: true,
  imports: [RouterLink],
  template: `
    <article class="container article-page">
      <nav class="breadcrumb"><a routerLink="/">Home</a> / Donate</nav>
      <h1>Donate</h1>
      <div class="prose">
        <p>Fellow scientists, council members, janitors.</p>
        <p>The Canonn’s operations/antics are, as we all know, essential to the future of the galaxy.</p>
        <p>As our esteemed Dr Arc said only recently:</p>
        <blockquote>
          <p>Without us, humanity is doomed to live in ignorance of the universe, and the potential threats it harbours.</p>
          <p>Without us, CMDRs who had otherwise given up on life would no longer be with us.</p>
          <p>Without us, the future of the biscuit trade looks, well… shaky at best.</p>
        </blockquote>
        <p>And it is with these inspiring words ringing in our ears, that I come to you, today, to request help.</p>
        <p><em>Financial</em> help. With Earth-money.</p>

        <h2>What do you need money for?</h2>
        <p>In short:</p>
        <ul>
          <li>The domain &amp; DNS – because it’s a “.science” domain, too, it costs a bit more than your standard domain – £25/year</li>
          <li>The one mailbox we’ve setup at Fasthosts is £1.49/month</li>
          <li>Hosting on Azure. The website runs as a VM in the Azure Cloud. At the moment it’s free because of some 100% discounting on Azure. When the discounts expire, the site will cost roughly £10/month to keep online.</li>
          <li>WordPress plugins – currently costing around £80/year to keep licensed</li>
          <li><strong>The various prizes that we issue</strong>. Sometimes, we send out quite a few!</li>
        </ul>

        <h2>What do I do?</h2>
        <p>If you feel able to contribute to our cause – then all you need to do is use this button:</p>
        <form action="https://www.paypal.com/cgi-bin/webscr" method="post" target="_blank">
          <input name="cmd" type="hidden" value="_donations" />
          <input name="bn" type="hidden" value="TipsandTricks_SP" />
          <input name="business" type="hidden" value="CmdrLadyOutspan@Gmail.com" />
          <input name="item_name" type="hidden" value="Canonn Online" />
          <input name="item_number" type="hidden" value="Costs" />
          <input name="rm" type="hidden" value="0" />
          <input name="currency_code" type="hidden" value="GBP" />
          <input alt="PayPal - The safer, easier way to pay online." name="submit" type="image"
                 src="https://www.paypal.com/en_US/i/btn/btn_donate_LG.gif" />
        </form>
        <p>Contribute as much or as little as you wish – any amount that you are willing to part with will be greatly appreciated. Please, though, do not sacrifice a UA in an attempt to raise cash, that would be a crime against science.</p>
        <p>Although <strong>please don’t click the “recurring payment” button: it doesn’t work with our PayPal account(!)</strong></p>

        <h2>And if I don’t want to/can’t contribute?</h2>
        <p>This is <strong>absolutely optional</strong> – there will be no favours/status granted to any member that contributes – because this faction is not about making/taking money – and never will be. Your status within the Canonn is derived from your knowledge, wisdom, clear-mindedness and the Tin Foil Hat you wear; not on how rich you are.</p>
        <p>So this funding drive is purely to help lighten the load on the Canonn coffers. <em>RP:Off – I have voluntarily paid everything so far – but have been compelled to create this donation page due to many people already asking me “can I chip in?”, which I find truly humbling. I will not use this cash for anything other than paying any bills incurred. Some of those are incurred through my own company – but if that is charged £x, or $y, then I will “charge” our donation fund that same amount.</em></p>
        <p><em>Any left over funds may be used as Prize Packs and Rewards at the discretion of the council.</em></p>

        <h4>Thank you</h4>
        <p>Thank you for reading – and thanks in advance for any donation you make.</p>
      </div>
    </article>
  `,
})
export class DonateComponent {}
