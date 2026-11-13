const toggleButton = document.getElementById("toggle-button");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");



function updateUI(enabled) {

    if (enabled) {

        statusDot.className = "enabled";
        statusText.textContent = "HAPP включён";

        toggleButton.textContent = "Выключить HAPP";
        toggleButton.className = "disable";

    } else {

        statusDot.className = "disabled";
        statusText.textContent = "HAPP выключен";

        toggleButton.textContent = "Включить HAPP";
        toggleButton.className = "enable";
    }
}



async function loadStatus() {

    const response = await browser.runtime.sendMessage({
        type: "getStatus"
    });

    updateUI(response.enabled);
}



toggleButton.addEventListener("click", async () => {

    toggleButton.disabled = true;

    const response = await browser.runtime.sendMessage({
        type: statusText.textContent === "HAPP включён"
            ? "disable"
            : "enable"
    });

    updateUI(response.enabled);

    toggleButton.disabled = false;
});



loadStatus();
