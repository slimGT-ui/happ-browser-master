const HAPP_PROXY = {
  proxyType: "manual",

  socks: "127.0.0.1",
  socksPort: 10808,
  socksVersion: 5,

  proxyDNS: true,

  passthrough: "localhost, 127.0.0.1, ::1"
};



async function enableHapp() {
  await browser.proxy.settings.set({
    value: HAPP_PROXY
  });

  await browser.storage.local.set({
    happEnabled: true
  });
}



async function disableHapp() {
  await browser.proxy.settings.clear();

  await browser.storage.local.set({
    happEnabled: false
  });
}



async function getStatus() {
  const settings = await browser.proxy.settings.get({});

  const value = settings.value;

  const enabled =
    value?.proxyType === "manual" &&
    value?.socks === "127.0.0.1" &&
    value?.socksPort === 10808;

  return enabled;
}



browser.runtime.onMessage.addListener(async (message) => {

  if (message.type === "getStatus") {
    return {
      enabled: await getStatus()
    };
  }


  if (message.type === "enable") {
    await enableHapp();

    return {
      enabled: true
    };
  }


  if (message.type === "disable") {
    await disableHapp();

    return {
      enabled: false
    };
  }

});
