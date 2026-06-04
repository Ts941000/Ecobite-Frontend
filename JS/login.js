import {
  getBackendMode,
  getLocalAuth,
  loginWithEmail,
  loginWithGoogle,
  registerWithEmail,
} from "./firebase-service.js";

let role = "user";

// Support ?role=hotel deep link from "List Your Hotel" page
const urlParams = new URLSearchParams(window.location.search);
const urlRole = urlParams.get("role");
if (urlRole === "hotel") {
  role = "hotel";
  // Auto-switch to signup tab with hotel role pre-selected on next tick
  setTimeout(() => {
    showTab("signup");
    setRole("hotel", "signup");
    setRole("hotel", "login");
  }, 0);
}

function showTab(tab) {
  const isLogin = tab === "login";
  document.getElementById("loginform").classList.toggle("show", isLogin);
  document.getElementById("signupform").classList.toggle("show", !isLogin);
  document.getElementById("logintab").classList.toggle("on", isLogin);
  document.getElementById("signuptab").classList.toggle("on", !isLogin);
  document.getElementById("formtitle").textContent = isLogin ? "Welcome Back!" : "Create Account";
  document.getElementById("formsub").textContent = isLogin
    ? "Login to find today's food deals near you"
    : "Join EcoBite and start ordering rescued meals";
}

function setRole(nextRole, mode) {
  role = nextRole;
  const userId = mode === "login" ? "luserrole" : "userrole";
  const hotelId = mode === "login" ? "lhotelrole" : "hotelrole";
  document.getElementById(userId).classList.toggle("on", role === "user");
  document.getElementById(hotelId).classList.toggle("on", role === "hotel");
}

function togglePassword(id, button) {
  const input = document.getElementById(id);
  const visible = input.type === "password";
  input.type = visible ? "text" : "password";
  button.textContent = visible ? "visibility_off" : "visibility";
}

function err(id, visible) {
  document.getElementById(id).classList.toggle("show", visible);
}

function showAuthMsg(message, icon = "cloud_done") {
  const toast = document.getElementById("loginToast");
  if (!toast) return;
  toast.querySelector(".material-symbols-rounded").textContent = icon;
  toast.querySelector("span:last-child").textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3500);
}

function setBusy(form, busy) {
  const button = form.querySelector(".submit");
  if (!button) return;
  button.disabled = busy;
  button.dataset.originalText ||= button.textContent;
  button.textContent = busy ? "Please wait..." : button.dataset.originalText;
}

function redirectByRole(authState) {
  window.location.href = authState.role === "hotel" ? "dashboard.html" : "EcoBite.html";
}

function friendlyAuthError(error) {
  const code = error?.code || "";
  if (code.includes("email-already-in-use")) return "This email already has an EcoBite account.";
  if (code.includes("invalid-credential") || code.includes("wrong-password")) return "Email or password is incorrect.";
  if (code.includes("popup-closed-by-user")) return "Google sign-in was closed before it finished.";
  if (code.includes("network-request-failed")) return "Network error. Check your connection and try again.";
  return error?.message || "Authentication failed. Please try again.";
}

async function validateLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = document.getElementById("lemail").value.trim();
  const pass = document.getElementById("lpass").value;
  const badEmail = !email.includes("@") || !email.includes(".");
  const badPass = pass.length < 6;

  err("emailerr", badEmail);
  err("passerr", badPass);
  if (badEmail || badPass) return;

  setBusy(form, true);
  try {
    const authState = await loginWithEmail({ email, password: pass, role });
    // Check if the user's actual account role differs from selected login role
    if (authState.role && authState.role !== role) {
      const correctRoleLabel = authState.role === 'hotel' ? 'Hotel' : 'User';
      showAuthMsg(`This is a ${correctRoleLabel} account. Please choose "I'm a ${correctRoleLabel}" to continue.`, "switch_account");
      // Auto-switch role selectors to the correct role
      setRole(authState.role, 'login');
      setBusy(form, false);
      return;
    }
    showAuthMsg(`Logged in successfully!`, "login");
    setTimeout(() => redirectByRole(authState), 500);
  } catch (error) {
    showAuthMsg(friendlyAuthError(error), "error");
  } finally {
    setBusy(form, false);
  }
}

async function validateSignup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const fname = document.getElementById("fname").value.trim();
  const lname = document.getElementById("lname").value.trim();
  const email = document.getElementById("semail").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const pass = document.getElementById("spass").value;
  const terms = document.getElementById("terms").checked;

  const checks = {
    fnameerr: fname === "",
    semailerr: !email.includes("@") || !email.includes("."),
    phoneerr: !/^\d{10}$/.test(phone),
    spasserr: pass.length < 6,
    termserr: !terms,
  };

  Object.entries(checks).forEach(([id, visible]) => err(id, visible));
  if (Object.values(checks).some(Boolean)) return;

  setBusy(form, true);
  try {
    const name = [fname, lname].filter(Boolean).join(" ");
    const authState = await registerWithEmail({ email, password: pass, name, phone, role });
    const mode = getBackendMode() === "firebase" ? "Firebase" : "demo";
    showAuthMsg(`Account created with ${mode} backend.`, "person_add");
    setTimeout(() => redirectByRole(authState), 500);
  } catch (error) {
    showAuthMsg(friendlyAuthError(error), "error");
  } finally {
    setBusy(form, false);
  }
}

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => showTab(button.dataset.tab));
});

document.querySelectorAll("[data-login-role]").forEach((button) => {
  button.addEventListener("click", () => setRole(button.dataset.loginRole, "login"));
});

document.querySelectorAll("[data-signup-role]").forEach((button) => {
  button.addEventListener("click", () => setRole(button.dataset.signupRole, "signup"));
});

document.querySelectorAll("[data-password-target]").forEach((button) => {
  button.addEventListener("click", () => togglePassword(button.dataset.passwordTarget, button));
});

document.querySelectorAll("[data-google-action]").forEach((button) => {
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const authState = await loginWithGoogle(role);
      if (authState.role && authState.role !== role) {
        const correctRoleLabel = authState.role === 'hotel' ? 'Hotel' : 'User';
        showAuthMsg(`This is a ${correctRoleLabel} account. Please choose "I'm a ${correctRoleLabel}" to continue.`, "switch_account");
        setRole(authState.role, 'login');
        button.disabled = false;
        return;
      }
      showAuthMsg("Logged in successfully!", "verified_user");
      setTimeout(() => redirectByRole(authState), 500);
    } catch (error) {
      showAuthMsg(friendlyAuthError(error), "error");
    } finally {
      button.disabled = false;
    }
  });
});

document.getElementById("loginform").addEventListener("submit", validateLogin);
document.getElementById("signupform").addEventListener("submit", validateSignup);
