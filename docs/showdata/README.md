# Show data mirror

Static fallback copies of the S.M.A.R.T fountain choreography, served by
GitHub Pages at `https://water-worx.github.io/smart-edition/showdata/<sid>.txt`.

Fountains fetch the **relay** first (`waterworx-relay.app-wx.deno.net/showdata?sid=N`)
because only it can be updated live. These files exist so a fountain still works
when the relay is unreachable — region HTTP trouble, estate firewall, DNS, or a
Deno Deploy outage. Different domain, DNS and CDN, so the two are unlikely to
fail together.

Format (identical to the relay response):

```
<step count>
<step0>::<step1>::...
<zone0>::<zone1>::...
<motif0>::<motif1>::...
```

sid: 400 Grand · 401 Romantic · 402 Moonlight · 403 Love · 404 Vampire

**Regenerate after any tuning change** so the mirror does not drift from the
relay — the fallback is only useful if it is the same show.
