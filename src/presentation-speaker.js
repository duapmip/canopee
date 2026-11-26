// A session pairs the two windows on this browser. Other people opening the
// public URL, or another presentation on the same machine, have their own.
export function pairPresentationWindows(button, isSpeaker, getSlide, receiveSlide) {
  const url = new URL(location.href);
  const role = isSpeaker ? "orateur" : "ecran";
  const other = isSpeaker ? "ecran" : "orateur";
  const saved = window.name.match(/^canopee-(?:orateur|ecran)-([\w-]+)$/)?.[1];
  const requested = url.searchParams.get("seance");
  const session = requested && /^[\w-]{1,80}$/.test(requested) ? requested : saved || crypto.getRandomValues(new Uint32Array(4)).join("-");
  window.name = `canopee-${role}-${session}`;
  button.target = `canopee-${other}-${session}`;
  button.textContent = isSpeaker ? "Écran à projeter" : "Notes orateur";
  button.title = isSpeaker ? "Afficher le diaporama dans une fenêtre séparée" : "Ouvrir les notes synchronisées dans une fenêtre séparée";
  button.hidden = false;

  const target = new URL(url);
  target.searchParams.set("seance", session);
  if (isSpeaker) target.searchParams.delete("orateur");
  else target.searchParams.set("orateur", "1");
  const updateLink = id => {
    target.hash = id;
    button.href = target.href;
  };
  updateLink(getSlide());

  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("canopee-pitch-" + session) : null;
  let peer = null;
  try {
    if (window.opener?.name === button.target) peer = window.opener;
  } catch { /* An unrelated cross-origin opener is not a companion window. */ }

  function send(type, id) {
    const message = { session, role, type, id };
    if (channel) channel.postMessage(message);
    else if (peer && !peer.closed) peer.postMessage(message, location.origin);
  }
  function receive(message) {
    if (message?.session !== session || message.role !== other) return;
    if (message.type === "hello") send("slide", getSlide());
    if (message.type === "slide") receiveSlide(message.id);
  }
  if (channel) channel.onmessage = event => receive(event.data);
  else window.addEventListener("message", event => {
    if (event.origin !== location.origin || event.data?.session !== session || event.data.role !== other) return;
    peer = event.source;
    receive(event.data);
  });
  button.addEventListener("click", event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (!peer || peer.closed) {
      peer = window.open(button.href, button.target, isSpeaker ? "" : "popup,width=940,height=760,resizable=yes,scrollbars=yes");
    }
    if (peer) {
      event.preventDefault();
      peer.focus();
    }
  });
  send("hello");
  return (id, notify) => {
    updateLink(id);
    if (notify) send("slide", id);
  };
}
