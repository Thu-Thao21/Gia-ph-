with open('FE/src/components/member/RelationshipFinder.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add import
code = code.replace(
    "import './RelationshipFinder.css';",
    "import './RelationshipFinder.css';\nimport { DualLineageModal } from '../network/DualLineageModal';"
)

# 2. Add state
old_state = "  const [loadingLineage, setLoadingLineage] = useState<boolean>(false);"
new_state = "  const [loadingLineage, setLoadingLineage] = useState<boolean>(false);\n  const [viewingDualLineageId, setViewingDualLineageId] = useState<string | null>(null);"
code = code.replace(old_state, new_state)

# 3. Add button in lineage picker row
old_btn = """            {myPerson && (
              <button
                type="button"
                className="rel-lineage-me-btn"
                onClick={() => setLineagePersonId(myPerson.id)}
              >
                Tra cứu dòng dõi của tôi
              </button>
            )}
          </div>"""

new_btn = """            {myPerson && (
              <button
                type="button"
                className="rel-lineage-me-btn"
                onClick={() => setLineagePersonId(myPerson.id)}
              >
                Tra cứu dòng dõi của tôi
              </button>
            )}

            {lineagePersonId && (
              <button
                type="button"
                className="rel-lineage-me-btn"
                style={{
                  background: '#7c3aed',
                  color: '#ffffff',
                  borderColor: '#6d28d9',
                  marginLeft: '8px',
                }}
                onClick={() => setViewingDualLineageId(lineagePersonId)}
              >
                Xem Sơ đồ 2-3 đời Bên Nội & Bên Ngoại
              </button>
            )}
          </div>"""
code = code.replace(old_btn, new_btn)

# 4. Render modal before closing div
old_end = "      )}\n    </div>\n  );\n};\n\nexport default RelationshipFinder;"
new_end = """      )}

      {viewingDualLineageId && (
        <DualLineageModal
          personId={viewingDualLineageId}
          onClose={() => setViewingDualLineageId(null)}
        />
      )}
    </div>
  );
};

export default RelationshipFinder;"""
code = code.replace(old_end, new_end)

with open('FE/src/components/member/RelationshipFinder.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS: RelationshipFinder.tsx updated")

