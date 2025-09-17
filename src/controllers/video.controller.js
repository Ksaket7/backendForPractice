import mongoose, { isValidObjectId } from "mongoose";
import { Video } from "../models/video.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  deleteFromCloudinary,
  uploadOnCloudinary,
} from "../utils/cloudinary.js";

const getAllVideos = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    query,
    sortBy = "views",
    sortType = "desc",
    userId,
  } = req.query;
  // creating filters to find relevant videos
  const filter = {};
  if (query) {
    filter.title = {
      $regex: query, // query matching with title
      $options: "i", // case-insensitive
    };
  }
  if (userId && isValidObjectId(userId)) {
    filter.owner = userId; // owner should be userId
  }
  const totalVideos = await Video.countDocuments(filter);

  const videos = (await Video.find(filter))
    .sort({ [sortBy]: sortType === "desc" ? -1 : 1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        videos,
        pagination: {
          totalResult: totalVideos,
          totalPages: Math.ceil(totalVideos / limit),
          currentPage: Number(page),
          limit: Number(limit),
        },
      },
      "Videos fetched successfully"
    )
  );
});

const publishVideo = asyncHandler(async (req, res) => {
  const { title, description } = req.body;

  if (!title || !description) {
    throw new ApiError(400, "Title and description are required");
  }

  const videoFilePath = req.files?.videoFile[0]?.path;
  const thumbnailPath = req.files?.thumbnail[0]?.path;
  if (!videoFilePath || !thumbnailPath) {
    throw new ApiError(400, "video file and thumbnail files are required ");
  }
  const videoUpload = await uploadOnCloudinary(videoFilePath);
  const thumbnailUpload = await uploadOnCloudinary(thumbnailPath);

  if (!videoUpload || !thumbnailUpload) {
    throw new ApiError(
      500,
      "Error while uploading video or thumbnail to cloudinary"
    );
  }

  const video = await Video.create({
    videoFile: videoUpload.url,
    videoFilePublicId: videoUpload.public_id,
    thumbnail: thumbnailUpload.url,
    thumbnailPublicId: thumbnailUpload.public_id,
    title,
    description,
    duration: videoUpload.duration || 0,
    owner: req.user._id,
  });
  return res
    .status(201)
    .json(new ApiResponse(200, video, "Video published successfully"));
});

const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID");
  }

  const video = await Video.findById(videoId).populate(
    "owner",
    "fullName username avatar"
  );
  if (!video) {
    throw new ApiError(404, "Video not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, video, "Video fetched successfully"));
});

const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  if (isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID");
  }
  const video = Video.findById(videoId);
  if (!video) {
    throw new ApiError(404, "Video not found");
  }
  if (video.owner.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "You are not allowed to update this video");
  }
  const { title, description } = req.body;
  if (req.files?.thumbnail) {
    const thumbnailPath = req.files.thumbnail[0].path;
    const thumbnailUpload = await uploadOnCloudinary(thumbnailPath);
    if (!thumbnailUpload) {
      throw new ApiError(500, "Error while uploading thumbnail");
    }
    video.thumbnail = thumbnailUpload.url;
    video.thumbnailPublicId = thumbnailUpload.public_id;
  }

  if (req.files?.videoFile) {
    const videoFilePath = req.files.videoFile[0].path;
    const videoUpload = await uploadOnCloudinary(videoFilePath);
    if (!videoUpload) {
      throw new ApiError(500, "Error while uploading video");
    }
    video.videoFile = videoUpload.url;
    videoFilePublicId = videoUpload.public_id;
    video.duration = videoUpload.duration || 0;
  }
  if (title) {
    video.title = title;
  }
  if (description) {
    video.description = description;
  }
  await video.save();

  return res
    .statsu(200)
    .json(new ApiResponse(200, video, "Video updated successfully"));
});

const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID");
  }
  const video = await Video.findById(videoId);
  if (!video) {
    throw new ApiError(404, "video not fount");
  }
  if (video.owner.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "you are not allowed to delete this video");
  }

  if (video.videoFilePublicId) {
    await deleteFromCloudinary(video.videoFilePublicId, "video");
  }
  if (video.thumbnailPublicId) {
    await deleteFromCloudinary(video.thumbnailPublicId, "image");
  }

  await Video.findByIdAndDelete(videoId);

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Video deleted successfully"));
});

const toggglePublishStatus = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID");
  }
  const video = await Video.findById(videoId);
  if (!video) {
    throw new ApiError(404, "video not fount");
  }
  if (video.owner.toString() !== req.user._id.toString()) {
    throw new ApiError(
      403,
      "you are not allowed to change public status for this video"
    );
  }
  video.isPublished = !video.isPublished;
  await video.save();
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        video,
        `video is now ${video.isPublished ? "Published" : "Unpublished"}`
      )
    );
});

export {
  getAllVideos,
  publishVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  toggglePublishStatus,
};
