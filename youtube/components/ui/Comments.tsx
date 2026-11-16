"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  Flag,
  Languages,
  MapPin,
  MessageCircle,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useUser } from "@/lib/authContext";
import axiosInstance from "@/lib/axiosInstance";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { Textarea } from "./textarea";
import { Button } from "./button";
import GoogleRecaptcha from "./GoogleRecaptcha";

type Reaction = "like" | "dislike" | null;
type SortOrder = "newest" | "oldest" | "mostLiked" | "relevant";

interface CommentAuthor {
  id: string;
  name: string;
  username: string | null;
  image: string;
  location: {
    city: string | null;
    state: string | null;
    country: string | null;
  };
}

interface Comment {
  _id: string;
  videoid: string;
  userid: string;
  parentComment: string | null;
  commentbody: string;
  usercommented: string;
  author: CommentAuthor;
  commentedon: string;
  editedAt: string | null;
  editableUntil: string;
  canEdit: boolean;
  deletedAt: string | null;
  isDeleted: boolean;
  version: number;
  likeCount: number;
  dislikeCount: number;
  myReaction: Reaction;
  replies: Comment[];
}

interface MentionUser {
  id: string;
  name: string;
  username: string;
  image: string;
}

interface CommentComposerProps {
  placeholder: string;
  buttonLabel: string;
  disabled?: boolean;
  busy?: boolean;
  onSubmit: (body: string) => Promise<boolean>;
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "data" in error.response &&
    typeof error.response.data === "object" &&
    error.response.data !== null &&
    "message" in error.response.data &&
    typeof error.response.data.message === "string"
  ) {
    return error.response.data.message;
  }
  return error instanceof Error ? error.message : fallback;
};

const CommentComposer = ({
  placeholder,
  buttonLabel,
  disabled = false,
  busy = false,
  onSubmit,
}: CommentComposerProps) => {
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [suggestions, setSuggestions] = useState<MentionUser[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mention = useMemo(() => {
    const beforeCaret = text.slice(0, caret);
    const match = beforeCaret.match(/(?:^|[^\p{L}\p{N}_])@([\p{L}\p{N}_]*)$/u);
    if (!match) return null;
    const start = beforeCaret.lastIndexOf("@");
    return { start, query: match[1] };
  }, [caret, text]);

  useEffect(() => {
    let active = true;
    if (!mention || mention.query.length < 2) return;

    const timer = window.setTimeout(() => {
      axiosInstance
        .get<MentionUser[]>("/comment/mentions/search", {
          params: { q: mention.query },
        })
        .then((response) => {
          if (active) setSuggestions(response.data);
        })
        .catch((error) => {
          if (active) {
            console.error("Unable to load mention suggestions:", error);
            setSuggestions([]);
          }
        });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [mention]);

  const insertMention = (user: MentionUser) => {
    if (!mention) return;
    const nextText = `${text.slice(0, mention.start)}@${user.username} ${text.slice(caret)}`;
    const nextCaret = mention.start + user.username.length + 2;
    setText(nextText);
    setCaret(nextCaret);
    setSuggestions([]);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const submit = async () => {
    if (!text.trim() || disabled || busy) return;
    if (await onSubmit(text)) setText("");
  };

  return (
    <div className="space-y-2">
      <Textarea
        ref={textareaRef}
        value={text}
        maxLength={2000}
        placeholder={placeholder}
        disabled={disabled || busy}
        onChange={(event) => {
          setText(event.target.value);
          setCaret(event.target.selectionStart);
        }}
        onClick={(event) => setCaret(event.currentTarget.selectionStart)}
        onKeyUp={(event) => setCaret(event.currentTarget.selectionStart)}
        className="min-h-20 resize-y"
      />
      {mention && mention.query.length >= 2 && suggestions.length > 0 && (
        <div className="rounded-md border bg-background p-2 shadow-sm">
          <p className="px-2 pb-1 text-xs text-muted-foreground">
            Mention a user
          </p>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => insertMention(suggestion)}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted"
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={suggestion.image} />
                <AvatarFallback>
                  {suggestion.name[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <span>
                {suggestion.name}{" "}
                <span className="text-muted-foreground">
                  @{suggestion.username}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {text.length}/2000
        </span>
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={!text.trim() || disabled || busy}
        >
          {busy ? "Posting..." : buttonLabel}
        </Button>
      </div>
    </div>
  );
};

interface CommentItemProps {
  comment: Comment;
  userId?: string;
  targetLanguage: string;
  busy: boolean;
  onReply: (parentId: string, body: string) => Promise<boolean>;
  onEdit: (comment: Comment, body: string) => Promise<boolean>;
  onDelete: (comment: Comment) => Promise<void>;
  onReact: (comment: Comment, type: Exclude<Reaction, null>) => Promise<void>;
  onReport: (
    comment: Comment,
    reason: string,
    details: string,
  ) => Promise<boolean>;
}

const REPORT_OPTIONS = [
  ["spam", "Spam"],
  ["harassment", "Harassment"],
  ["offensive", "Offensive content"],
  ["misinformation", "Misinformation"],
  ["other", "Other"],
];

const CommentItem = ({
  comment,
  userId,
  targetLanguage,
  busy,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onReport,
}: CommentItemProps) => {
  const [replyOpen, setReplyOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.commentbody);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("spam");
  const [reportDetails, setReportDetails] = useState("");
  const [translation, setTranslation] = useState<{
    language: string;
    text: string;
  } | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const isOwner = userId === comment.userid;
  const canEdit = isOwner && !comment.isDeleted && comment.canEdit;
  const canDelete = isOwner && !comment.isDeleted;
  const location = [
    comment.author.location.city,
    comment.author.location.state,
    comment.author.location.country,
  ]
    .filter(Boolean)
    .join(", ");

  const submitEdit = async () => {
    if (!editText.trim()) return;
    if (await onEdit(comment, editText)) setEditing(false);
  };

  const translate = async () => {
    if (translation?.language === targetLanguage) {
      setShowTranslation((visible) => !visible);
      setTranslationError("");
      return;
    }

    setTranslationLoading(true);
    setTranslationError("");
    try {
      const response = await axiosInstance.post<{
        translatedText: string;
        detectedSourceLanguage: string | null;
      }>("/comment/translate", {
        text: comment.commentbody,
        targetLanguage,
      });
      setTranslation({
        language: targetLanguage,
        text: response.data.translatedText,
      });
      setShowTranslation(true);
    } catch (requestError) {
      setTranslationError(
        getErrorMessage(requestError, "This comment could not be translated."),
      );
    } finally {
      setTranslationLoading(false);
    }
  };

  const translatedForSelectedLanguage =
    translation?.language === targetLanguage && showTranslation;
  const translationButtonText = translationLoading
    ? "Translating..."
    : translatedForSelectedLanguage
      ? "Show original"
      : translation?.language === targetLanguage
        ? "Show translation"
        : "Translate";
  return (
    <article className="flex gap-3">
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarImage src={comment.author.image} />
        <AvatarFallback>
          {comment.author.name[0]?.toUpperCase() || "U"}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold">{comment.author.name}</span>
          {comment.author.username && (
            <span className="text-xs text-muted-foreground">
              @{comment.author.username}
            </span>
          )}
          <time
            className="text-xs text-muted-foreground"
            dateTime={comment.commentedon}
          >
            {new Date(comment.commentedon).toLocaleString()}
          </time>
          {comment.editedAt && (
            <span className="text-xs text-muted-foreground">(edited)</span>
          )}
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {location || "Location unavailable"}
          </span>
        </div>

        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={editText}
              maxLength={2000}
              onChange={(event) => setEditText(event.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button
                disabled={!editText.trim() || busy}
                onClick={() => void submitEdit()}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap wrap-break-word text-sm">
            {translatedForSelectedLanguage ? (
              translation?.text || comment.commentbody
            ) : (
              comment.commentbody
            )}
          </p>
        )}
        {translatedForSelectedLanguage && (
          <p className="text-xs text-muted-foreground">
            Google translation may not be exact.
          </p>
        )}
        {translationError && (
          <p role="status" className="text-xs text-destructive">
            {translationError}
          </p>
        )}

        {!comment.isDeleted && (
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={comment.myReaction === "like"}
              onClick={() => void onReact(comment, "like")}
              disabled={!userId || busy}
            >
              <ThumbsUp className="mr-1 h-4 w-4" />
              {comment.likeCount}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={comment.myReaction === "dislike"}
              onClick={() => void onReact(comment, "dislike")}
              disabled={!userId || busy}
            >
              <ThumbsDown className="mr-1 h-4 w-4" />
              {comment.dislikeCount}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReplyOpen((open) => !open)}
              disabled={!userId || busy}
            >
              <MessageCircle className="mr-1 h-4 w-4" />
              Reply
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void translate()}
              disabled={translationLoading}
            >
              <Languages className="mr-1 h-4 w-4" />
              {translationButtonText}
            </Button>
            {userId && !isOwner && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReportOpen((open) => !open)}
                disabled={busy}
              >
                <Flag className="mr-1 h-4 w-4" />
                Report
              </Button>
            )}
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditText(comment.commentbody);
                  setEditing(true);
                }}
              >
                Edit
              </Button>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void onDelete(comment)}
                disabled={busy}
              >
                Delete
              </Button>
            )}
          </div>
        )}

        {replyOpen && userId && (
          <CommentComposer
            placeholder={`Reply to ${comment.author.name}...`}
            buttonLabel="Reply"
            busy={busy}
            onSubmit={async (body) => {
              const success = await onReply(comment._id, body);
              if (success) setReplyOpen(false);
              return success;
            }}
          />
        )}

        {reportOpen && (
          <div className="space-y-2 rounded-md border p-3">
            <label
              className="block text-xs font-medium"
              htmlFor={`report-${comment._id}`}
            >
              Why are you reporting this comment?
            </label>
            <select
              id={`report-${comment._id}`}
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
            >
              {REPORT_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Textarea
              value={reportDetails}
              maxLength={500}
              placeholder="Additional details (optional)"
              onChange={(event) => setReportDetails(event.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReportOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  void onReport(comment, reportReason, reportDetails).then(
                    (success) => {
                      if (success) {
                        setReportOpen(false);
                        setReportDetails("");
                      }
                    },
                  );
                }}
              >
                Submit report
              </Button>
            </div>
          </div>
        )}

        {comment.replies.length > 0 && (
          <div className="space-y-4 border-l pl-4">
            {comment.replies.map((reply) => (
              <CommentItem
                key={reply._id}
                comment={reply}
                userId={userId}
                targetLanguage={targetLanguage}
                busy={busy}
                onReply={onReply}
                onEdit={onEdit}
                onDelete={onDelete}
                onReact={onReact}
                onReport={onReport}
              />
            ))}
          </div>
        )}
      </div>
    </article>
  );
};

const buildCommentTree = (comments: Comment[]) => {
  const allById = new Map(comments.map((comment) => [comment._id, comment]));
  const visibleById = new Map<string, Comment>();
  const roots: Comment[] = [];
  for (const comment of comments) {
    if (!comment.isDeleted) {
      visibleById.set(comment._id, { ...comment, replies: [] });
    }
  }
  for (const comment of visibleById.values()) {
    let parent = comment.parentComment
      ? allById.get(comment.parentComment)
      : undefined;
    while (parent?.isDeleted) {
      parent = parent.parentComment
        ? allById.get(parent.parentComment)
        : undefined;
    }

    const visibleParent = parent ? visibleById.get(parent._id) : undefined;
    if (visibleParent) visibleParent.replies.push(comment);
    else roots.push(comment);
  }
  return roots;
};

const CommentSection = ({ videoId }: { videoId: string }) => {
  const { user, handleGoogleSignIn } = useUser();
  const [comments, setComments] = useState<Comment[]>([]);
  const [sort, setSort] = useState<SortOrder>("newest");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [preferredLanguage, setPreferredLanguage] = useState("en");
  const tree = useMemo(() => buildCommentTree(comments), [comments]);
  const commentCount = comments.filter((comment) => !comment.isDeleted).length;

  const loadComments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axiosInstance.get<Comment[]>(
        `/comment/${videoId}`,
        {
          params: { sort, limit: 100 },
        },
      );
      setComments(response.data);
      setError("");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Comments could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [sort, videoId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadComments();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadComments]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const browserLanguage = navigator.language.split("-")[0];
      const supported = new Set([
        "en",
        "es",
        "fr",
        "de",
        "hi",
        "it",
        "ja",
        "pt",
        "ru",
      ]);
      try {
        const saved = window.localStorage.getItem("youtube-comment-language");
        const preference = saved || browserLanguage;
        setPreferredLanguage(supported.has(preference) ? preference : "en");
      } catch {
        setPreferredLanguage(
          supported.has(browserLanguage) ? browserLanguage : "en",
        );
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const submitComment = async (body: string, parentCommentId?: string) => {
    if (!user) {
      setError("Sign in to post a comment.");
      return false;
    }
    setBusy(true);
    setError("");
    try {
      const response = await axiosInstance.post("/comment/postcomment", {
        videoid: videoId,
        commentbody: body,
        parentCommentId,
        captchaToken,
      });
      setComments((previous) => [...previous, response.data.comment]);
      setCaptchaRequired(false);
      setCaptchaToken(null);
      setCaptchaResetKey((current) => current + 1);
      return true;
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        const responseData: unknown = requestError.response?.data;
        if (
          typeof responseData === "object" &&
          responseData !== null &&
          "code" in responseData &&
          responseData.code === "CAPTCHA_REQUIRED"
        ) {
          setCaptchaRequired(true);
        }
      }
      setError(
        getErrorMessage(requestError, "The comment could not be posted."),
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const updateComment = async (comment: Comment, body: string) => {
    setBusy(true);
    setError("");
    try {
      const response = await axiosInstance.post(
        `/comment/editcomment/${comment._id}`,
        { commentbody: body, version: comment.version },
      );
      setComments((previous) =>
        previous.map((entry) =>
          entry._id === comment._id ? response.data.comment : entry,
        ),
      );
      return true;
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, "The comment could not be edited."),
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const deleteComment = async (comment: Comment) => {
    if (!window.confirm("Delete this comment? Replies will remain visible."))
      return;
    setBusy(true);
    setError("");
    try {
      await axiosInstance.delete(`/comment/deletecomment/${comment._id}`);
      setComments((previous) =>
        previous.map((entry) =>
          entry._id === comment._id
            ? {
                ...entry,
                commentbody: "",
                deletedAt: new Date().toISOString(),
                isDeleted: true,
                version: entry.version + 1,
              }
            : entry,
        ),
      );
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, "The comment could not be deleted."),
      );
    } finally {
      setBusy(false);
    }
  };

  const reactToComment = async (
    comment: Comment,
    type: Exclude<Reaction, null>,
  ) => {
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      const response = await axiosInstance.post(
        `/comment/reaction/${comment._id}`,
        {
          type: comment.myReaction === type ? null : type,
        },
      );
      setComments((previous) =>
        previous.map((entry) =>
          entry._id === comment._id ? { ...entry, ...response.data } : entry,
        ),
      );
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, "The reaction could not be saved."),
      );
    } finally {
      setBusy(false);
    }
  };

  const reportComment = async (
    comment: Comment,
    reason: string,
    details: string,
  ) => {
    setBusy(true);
    setError("");
    try {
      await axiosInstance.post(`/comment/report/${comment._id}`, {
        reason,
        details,
      });
      setError("Report submitted for administrator review.");
      return true;
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, "The report could not be submitted."),
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const changeLanguage = (language: string) => {
    setPreferredLanguage(language);
    try {
      window.localStorage.setItem("youtube-comment-language", language);
    } catch (storageError) {
      console.warn("Unable to save comment language preference:", storageError);
    }
  };

  return (
    <section className="space-y-6" aria-labelledby="comments-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="comments-heading" className="text-xl font-semibold">
          {commentCount} Comments
        </h2>
        <label className="flex items-center gap-2 text-sm">
          Sort by
          <select
            className="rounded-md border bg-background px-2 py-1"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortOrder)}
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="mostLiked">Most liked</option>
            <option value="relevant">Most relevant</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Languages className="h-4 w-4" />
        <label htmlFor="comment-language">Translate comments to</label>
        <select
          id="comment-language"
          className="rounded-md border bg-background px-2 py-1 text-foreground"
          value={preferredLanguage}
          onChange={(event) => changeLanguage(event.target.value)}
        >
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
          <option value="hi">Hindi</option>
          <option value="it">Italian</option>
          <option value="ja">Japanese</option>
          <option value="pt">Portuguese</option>
          <option value="ru">Russian</option>
        </select>
      </div>

      {error && (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">
          {error}
        </p>
      )}

      {captchaRequired && (
        <div className="rounded-md border p-3">
          <p className="mb-2 text-sm">
            Complete Google reCAPTCHA to continue commenting.
          </p>
          <GoogleRecaptcha
            onChange={setCaptchaToken}
            resetKey={captchaResetKey}
          />
        </div>
      )}

      {user ? (
        <div className="flex gap-3">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={user.image || ""} />
            <AvatarFallback>
              {user.name?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <CommentComposer
              placeholder="Add a comment..."
              buttonLabel="Comment"
              busy={busy}
              onSubmit={(body) => submitComment(body)}
            />
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={handleGoogleSignIn}>
          Sign in to comment
        </Button>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading comments...</p>
      ) : tree.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">
          No comments yet. Be the first to comment!
        </p>
      ) : (
        <div className="space-y-6">
          {tree.map((comment) => (
            <CommentItem
              key={comment._id}
              comment={comment}
              userId={user?._id}
              targetLanguage={preferredLanguage}
              busy={busy}
              onReply={(parentId, body) => submitComment(body, parentId)}
              onEdit={updateComment}
              onDelete={deleteComment}
              onReact={reactToComment}
              onReport={reportComment}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default CommentSection;
