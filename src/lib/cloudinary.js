import { v2 as cloudinary } from "cloudinary";

let configured = false;

function getCloudinary() {
  if (!configured) {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) throw new Error("Cloudinary is not configured.");
    cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET, secure: true });
    configured = true;
  }
  return cloudinary;
}

export function uploadStudentPhoto(buffer, studentUid) {
  return new Promise((resolve, reject) => {
    const uploader = getCloudinary().uploader.upload_stream({ folder: "sirius/students", public_id: studentUid, overwrite: true, resource_type: "image", transformation: [{ width: 800, height: 1000, crop: "limit", quality: "auto", fetch_format: "auto" }] }, (error, result) => error ? reject(error) : resolve(result));
    uploader.end(buffer);
  });
}

export function uploadSchoolLogo(buffer) {
  return new Promise((resolve, reject) => {
    const uploader = getCloudinary().uploader.upload_stream({ folder: "sirius/schools", public_id: "default-logo", overwrite: true, resource_type: "image", transformation: [{ width: 600, height: 600, crop: "limit", quality: "auto", fetch_format: "auto" }] }, (error, result) => error ? reject(error) : resolve(result));
    uploader.end(buffer);
  });
}