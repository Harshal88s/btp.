/*
 * ============================================================
 *  SRVP DATABASE SCHEMA  —  the ONE place that defines your data
 * ============================================================
 *
 *  Every table the backend stores (students, faculty, enquiries ...)
 *  is described here. The server creates the tables from this file,
 *  and the Admin Panel builds its forms and tables from it too.
 *
 *  TO ADD A NEW FIELD (e.g. "Blood group" for students):
 *    1. Add a line to that table's `fields` list, e.g.
 *         { name: 'blood_group', label: 'Blood Group', type: 'select',
 *           options: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] },
 *    2. Restart the server (npm start). The column is added
 *       automatically — existing data is NOT lost.
 *    3. (Optional) add its name to `list` to show it as a column.
 *
 *  Field types: text, textarea, number, date, email, tel, select, checkbox
 *  `name` must be lowercase_with_underscores and never changed later
 *  (changing it creates a new empty column). `label` can change any time.
 *
 *  Never delete the `id`, `created_at`, `updated_at` columns — they
 *  are added automatically and are not listed here.
 */

module.exports = {
  students: {
    label: 'Students',
    fields: [
      { name: 'roll_no', label: 'Roll No', type: 'text' },
      { name: 'full_name', label: 'Full Name', type: 'text', required: true },
      { name: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Other'] },
      { name: 'dob', label: 'Date of Birth', type: 'date' },
      { name: 'class_grade', label: 'Class / Std', type: 'text' },
      // EDIT these options to match your real batch names
      { name: 'course', label: 'Course', type: 'select', options: ['Foundation', 'Competitive Exams', 'Foundation + Competitive', 'Other'] },
      { name: 'batch', label: 'Batch', type: 'text' },
      { name: 'mode', label: 'Mode', type: 'select', options: ['Offline', 'Online'], required: true },
      { name: 'school_name', label: 'School', type: 'text' },
      { name: 'parent_name', label: 'Parent / Guardian', type: 'text' },
      { name: 'phone', label: 'Phone', type: 'tel' },
      { name: 'alt_phone', label: 'Alternate Phone', type: 'tel' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'address', label: 'Address', type: 'textarea' },
      { name: 'admission_date', label: 'Admission Date', type: 'date' },
      { name: 'fee_total', label: 'Total Fee (₹)', type: 'number' },
      { name: 'fee_paid', label: 'Fee Paid (₹)', type: 'number' },
      { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Completed', 'Left'] },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    list: ['roll_no', 'full_name', 'class_grade', 'course', 'batch', 'mode', 'phone', 'fee_total', 'fee_paid', 'status'],
    filters: ['mode', 'course', 'status'],
  },

  faculty: {
    label: 'Faculty',
    fields: [
      { name: 'full_name', label: 'Full Name', type: 'text', required: true },
      { name: 'subject', label: 'Subject(s)', type: 'text' },
      { name: 'qualification', label: 'Qualification', type: 'text' },
      { name: 'experience_years', label: 'Experience (years)', type: 'number' },
      { name: 'mode', label: 'Teaches', type: 'select', options: ['Offline', 'Online', 'Both'] },
      { name: 'phone', label: 'Phone', type: 'tel' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'joining_date', label: 'Joining Date', type: 'date' },
      { name: 'salary', label: 'Monthly Pay (₹)', type: 'number' },
      { name: 'bio', label: 'Short Bio (shown on website)', type: 'textarea' },
      { name: 'photo_url', label: 'Photo path, e.g. images/faculty/name.jpg', type: 'text' },
      { name: 'show_on_site', label: 'Show on website', type: 'checkbox' },
      { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Left'] },
    ],
    list: ['full_name', 'subject', 'qualification', 'experience_years', 'mode', 'phone', 'show_on_site', 'status'],
    filters: ['mode', 'status'],
    // Only these columns are ever sent to the public website (never phone/salary)
    public: ['full_name', 'subject', 'qualification', 'experience_years', 'bio', 'photo_url'],
    publicWhere: "show_on_site = 1 AND (status IS NULL OR status = '' OR status = 'Active')",
  },

  enquiries: {
    label: 'Enquiries',
    fields: [
      { name: 'student_name', label: 'Student Name', type: 'text', required: true },
      { name: 'parent_name', label: 'Parent Name', type: 'text' },
      { name: 'phone', label: 'Phone', type: 'tel', required: true },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'class_grade', label: 'Class / Std', type: 'text' },
      { name: 'course', label: 'Interested In', type: 'text' },
      { name: 'mode', label: 'Mode', type: 'select', options: ['Offline', 'Online', 'Not sure'] },
      { name: 'message', label: 'Message', type: 'textarea' },
      { name: 'status', label: 'Status', type: 'select', options: ['New', 'Contacted', 'Admitted', 'Closed'] },
      { name: 'followup_notes', label: 'Follow-up Notes', type: 'textarea' },
    ],
    list: ['created_at', 'student_name', 'parent_name', 'phone', 'class_grade', 'course', 'mode', 'status'],
    filters: ['status', 'mode'],
  },

  results: {
    label: 'Results / Toppers',
    fields: [
      { name: 'student_name', label: 'Student Name', type: 'text', required: true },
      { name: 'exam', label: 'Exam', type: 'text', required: true },
      { name: 'year', label: 'Year', type: 'number' },
      { name: 'achievement', label: 'Achievement (rank / marks / selection)', type: 'text' },
      { name: 'photo_url', label: 'Photo path, e.g. images/toppers/name.jpg', type: 'text' },
      { name: 'show_on_site', label: 'Show on website', type: 'checkbox' },
    ],
    list: ['year', 'student_name', 'exam', 'achievement', 'show_on_site'],
    filters: [],
    public: ['student_name', 'exam', 'year', 'achievement', 'photo_url'],
    publicWhere: 'show_on_site = 1',
    publicOrder: 'year DESC, id DESC',
  },

  announcements: {
    label: 'Announcements',
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'body', label: 'Details', type: 'textarea' },
      { name: 'link', label: 'Link (optional)', type: 'text' },
      { name: 'is_active', label: 'Show on website', type: 'checkbox' },
    ],
    list: ['created_at', 'title', 'is_active'],
    filters: [],
    public: ['title', 'body', 'link', 'created_at'],
    publicWhere: 'is_active = 1',
  },
};
