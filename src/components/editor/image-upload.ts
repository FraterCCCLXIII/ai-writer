import { createImageUpload } from "novel";

export const uploadFn = createImageUpload({
  validateFn: (file) => {
    if (!file.type.startsWith("image/")) {
      throw new Error("Please choose an image file");
    }
  },
  onUpload: (file) =>
    new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    }),
});
