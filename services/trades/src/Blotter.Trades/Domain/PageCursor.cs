using System.Buffers.Text;
using System.Text;

namespace Blotter.Trades.Domain;

/// <summary>
/// Opaque keyset cursors: the base64url text of the last row's uuid, as the Node API produced them.
/// Base64 is for opacity, not secrecy: a client that can read a cursor starts building one.
/// </summary>
internal static class PageCursor
{
    /// <summary>Encodes a row id as a cursor.</summary>
    /// <param name="id">The uuid of the last row on the page.</param>
    /// <returns>The cursor to hand back as <c>next_cursor</c>.</returns>
    public static string Encode(Guid id) => Base64Url.EncodeToString(Encoding.UTF8.GetBytes(id.ToString()));

    /// <summary>
    /// Decodes a cursor from a client. Anything that does not decode to a uuid counts as no cursor,
    /// so a stale or hand-edited one returns the first page instead of an error.
    /// </summary>
    /// <param name="cursor">The query value, if any.</param>
    /// <returns>The row id, or null for the first page.</returns>
    public static Guid? Decode(string? cursor)
    {
        if (string.IsNullOrEmpty(cursor) || !Base64Url.IsValid(cursor))
        {
            return null;
        }

        var text = Encoding.UTF8.GetString(Base64Url.DecodeFromChars(cursor));
        return Guid.TryParseExact(text, "D", out var id) ? id : null;
    }
}
