import Swal from "sweetalert2";

const buttonStyles = {
  confirmButtonColor: "#3b6fe8",
  cancelButtonColor: "#718078",
  buttonsStyling: true,
};

export async function confirmDialog(text, {
  title = "Are you sure?",
  confirmText = "Continue",
  cancelText = "Cancel",
  danger = false,
} = {}) {
  const result = await Swal.fire({
    title,
    text,
    icon: danger ? "warning" : "question",
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    confirmButtonColor: danger ? "#c2413b" : buttonStyles.confirmButtonColor,
    cancelButtonColor: buttonStyles.cancelButtonColor,
    reverseButtons: true,
    focusCancel: true,
  });
  return result.isConfirmed;
}

export async function promptDialog(title, {
  value = "",
  input = "text",
  placeholder = "",
  confirmText = "Save",
  validator,
} = {}) {
  const result = await Swal.fire({
    title,
    input,
    inputValue: value,
    inputPlaceholder: placeholder,
    inputAttributes: { autocomplete: input === "password" ? "new-password" : "off" },
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: "Cancel",
    ...buttonStyles,
    inputValidator: validator || ((inputValue) => String(inputValue || "").trim() ? undefined : "This field is required."),
  });
  return result.isConfirmed ? result.value : null;
}

export function notifySuccess(title, text) {
  return Swal.fire({ title, text, icon: "success", ...buttonStyles });
}

export function notifyError(title, text) {
  return Swal.fire({ title, text, icon: "error", ...buttonStyles });
}
